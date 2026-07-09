const { GoogleGenAI } = require('@google/genai');

const { functionDeclarations, buildToolExecutors } = require('./agent.tools');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_INSTRUCTION = `אתה עוזר AI לאפליקציית ספירת קלוריות.
תפקידך לעזור למשתמשים לנהל את יומן האכילה היומי, לחפש מוצרים, להוסיף או להסיר פריטים מהסל, וליצור או למחוק מוצרים פרטיים.
השתמש בכלים (tools) רק כאשר המשתמש מבקש לבצע פעולה במערכת או כשאתה צריך מידע מהמערכת.
לפני הוספת פריט לסל, חפש את המוצר אם אינך בטוח בשם המדויק או ביחידות המנה הזמינות.
ענה בעברית, בצורה קצרה, ידידותית וברורה.
לאחר ביצוע פעולה, סכם למשתמש מה נעשה.`;

let aiClient;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw Object.assign(new Error('Gemini API key is not configured'), { statusCode: 503 });
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  return aiClient;
}

function mapHistoryToContents(history = []) {
  return history
    .filter((entry) => entry?.content?.trim())
    .map((entry) => ({
      role: entry.role === 'agent' ? 'model' : 'user',
      parts: [{ text: entry.content.trim() }],
    }));
}

function buildInitialContents(message, history = []) {
  return [...mapHistoryToContents(history), { role: 'user', parts: [{ text: message.trim() }] }];
}

// Gemini יכול להחזיר Tool Calls בשתי צורות.
function extractFunctionCalls(response) {
  const accessorCalls = response.functionCalls;
  if (accessorCalls?.length) {
    return accessorCalls;
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => part.functionCall?.name)
    .map((part) => part.functionCall);
}

function appendModelTurn(contents, response) {
  const modelContent = response.candidates?.[0]?.content;

  if (modelContent?.parts?.length) {
    const parts = modelContent.parts.filter(
      (part) =>
        part.functionCall ||
        (typeof part.text === 'string' && part.text.trim().length > 0)
    );

    if (parts.length > 0) {
      contents.push({
        role: modelContent.role || 'model',
        parts,
      });
      return;
    }
  }

  const functionCalls = extractFunctionCalls(response);
  if (functionCalls.length > 0) {
    contents.push({
      role: 'model',
      parts: functionCalls.map((call) => ({ functionCall: call })),
    });
  }
}

// מחזיר את התוצאה ל-Gemini.
function buildFunctionResponsePart(call, result) {
  const functionResponse = {
    name: call.name,
    response: result,
  };

  if (call.id) {
    functionResponse.id = call.id;
  }

  return { functionResponse };
}

// פונקציה שמריצה Tool
async function executeFunctionCall(call, executors, toolsUsed) {
  const executor = executors[call.name];
  let result;

  if (!executor) {
    result = { error: `Unknown tool: ${call.name}` };
  } else {
    try {
      result = await executor(call.args || {});
    } catch (error) {
      result = { error: error.message || `Failed to execute ${call.name}` };
    }
  }

  toolsUsed.push({
    name: call.name,
    status: result?.error ? 'error' : 'success',
    args: call.args,
    result,
  });

  return buildFunctionResponsePart(call, result);
}
// פונקציה  שמפעילה את כל האג'נט מתחילתו ועד סופו.
async function runAgent({ message, history = [], user }) {
  if (!message?.trim()) {
    throw Object.assign(new Error('Message is required'), { statusCode: 400 });
  }

  const ai = getClient();
  const executors = buildToolExecutors(user);
  const contents = buildInitialContents(message, history);
  const toolsUsed = [];

  const generateConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    tools: [{ functionDeclarations }],
  };

  let response;
  let iteration = 0;
  let lastResponseRequestedTools = false;

  while (iteration < MAX_TOOL_ITERATIONS) {
    response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: generateConfig,
    });
    iteration += 1;

    const functionCalls = extractFunctionCalls(response);

    // No tool calls (text-only or empty): exit immediately — do not send another API request.
    if (!functionCalls.length) {
      lastResponseRequestedTools = false;
      break;
    }

    lastResponseRequestedTools = true;
    appendModelTurn(contents, response);

    const functionResponseParts = [];

    for (const call of functionCalls) {
      const part = await executeFunctionCall(call, executors, toolsUsed);
      functionResponseParts.push(part);
    }

    contents.push({
      role: 'user',
      parts: functionResponseParts,
    });
  }

  // Tool loop exhausted while the model still requested tools — one final text-only call.
  if (lastResponseRequestedTools) {
    response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
  }

  return {
    reply: response?.text?.trim() || 'מצטער, לא הצלחתי להשיב. נסה שוב.',
    toolsUsed,
  };
}

module.exports = {
  runAgent,
};
