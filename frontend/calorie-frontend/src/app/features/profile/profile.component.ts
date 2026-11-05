// הוא מנהל טופס Reactive לעדכון פרטים, טוען מידע מהשרת, מאפשר העלאת תמונת פרופיל, משתמש ב־
// NgRx לשמירת מצב המשתמש ומטפל בהודעות ובמצבי טעינה.
import { Location } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Store } from '@ngrx/store';
import { finalize } from 'rxjs';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { AuthActions } from '../../store/auth/auth.actions';
import { LogsActions } from '../../store/logs/logs.actions';
import { CalorieFormatPipe } from '../../shared/pipes/calorie-format.pipe';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'veryActive';
type GoalDirection = 'lose' | 'maintain' | 'gain';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

const GOAL_ADJUSTMENTS: Record<GoalDirection, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

const MIN_CALORIE_GOAL = 500;
const MAX_CALORIE_GOAL = 10000;

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    CalorieFormatPipe,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly userService = inject(UserService);
  private readonly toastr = inject(ToastrService);
  private readonly store = inject(Store);
  private readonly location = inject(Location);

  readonly loading = signal(false);
  readonly imageLoading = signal(false);
  readonly email = signal('');
  readonly profileImageUrl = signal('');
  readonly recommendedCalories = signal<number | null>(null);
  readonly calculatorError = signal('');

  readonly genderOptions = [
    { value: 'male', label: 'זכר' },
    { value: 'female', label: 'נקבה' },
    { value: 'other', label: 'אחר' },
  ];

  readonly activityOptions: { value: ActivityLevel; label: string }[] = [
    { value: 'sedentary', label: 'יושבני (עבודה משרדית, מעט פעילות)' },
    { value: 'light', label: 'קל (פעילות קלה 1–3 פעמים בשבוע)' },
    { value: 'moderate', label: 'בינוני (פעילות 3–5 פעמים בשבוע)' },
    { value: 'active', label: 'פעיל (פעילות 6–7 פעמים בשבוע)' },
    { value: 'veryActive', label: 'פעיל מאוד (עבודה פיזית או אימונים כפולים)' },
  ];

  readonly goalOptions: { value: GoalDirection; label: string }[] = [
    { value: 'lose', label: 'הרזיה' },
    { value: 'maintain', label: 'שמירה על משקל' },
    { value: 'gain', label: 'עלייה במשקל' },
  ];

  activityLevel: ActivityLevel = 'light';
  goalDirection: GoalDirection = 'maintain';

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    calorieGoal: [2000, [Validators.required, Validators.min(1)]],
    age: [null as number | null, [Validators.min(0)]],
    gender: [''],
    weight: [null as number | null, [Validators.min(0)]],
    height: [null as number | null, [Validators.min(0)]],
  });

  ngOnInit(): void {
    this.loadProfile();
  }

  goBack(): void {
    this.location.back();
  }

  canCalculateRecommended(): boolean {
    const { age, gender, weight, height } = this.form.getRawValue();
    return (
      age != null &&
      age > 0 &&
      weight != null &&
      weight > 0 &&
      height != null &&
      height > 0 &&
      !!gender
    );
  }

  calculateRecommended(): void {
    this.calculatorError.set('');

    if (!this.canCalculateRecommended()) {
      this.calculatorError.set('יש למלא גיל, מין, משקל וגובה לפני החישוב');
      this.recommendedCalories.set(null);
      return;
    }

    const { age, gender, weight, height } = this.form.getRawValue();
    const bmr = this.calculateBmr(gender!, age!, weight!, height!);
    const tdee = bmr * ACTIVITY_FACTORS[this.activityLevel];
    const adjusted = tdee + GOAL_ADJUSTMENTS[this.goalDirection];
    const rounded = Math.round(adjusted / 10) * 10;
    const clamped = Math.min(MAX_CALORIE_GOAL, Math.max(MIN_CALORIE_GOAL, rounded));

    this.recommendedCalories.set(clamped);
  }

  applyRecommendedGoal(): void {
    const recommended = this.recommendedCalories();
    if (recommended == null) {
      return;
    }

    this.form.controls.calorieGoal.setValue(recommended);
    this.form.controls.calorieGoal.markAsDirty();
    this.toastr.success('היעד הקלורי עודכן — לחצי "שמירת שינויים" לשמירה');
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { name, calorieGoal, age, gender, weight, height } = this.form.getRawValue();

    this.loading.set(true);
    this.userService
      .updateProfile({
        name,
        calorieGoal,
        age: age ?? undefined,
        gender: gender || undefined,
        weight: weight ?? undefined,
        height: height ?? undefined,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (user) => {
          this.store.dispatch(AuthActions.setUser({ user }));
          this.store.dispatch(LogsActions.loadToday());
          this.toastr.success('הפרופיל עודכן בהצלחה');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error(err.error?.message ?? 'אירעה שגיאה בעדכון הפרופיל');
        },
      });
  }

  logout(): void {
    this.store.dispatch(AuthActions.logout());
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.toastr.error('ניתן להעלות רק קבצי JPEG, PNG או WebP');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      this.toastr.error('גודל התמונה חייב להיות עד 2MB');
      return;
    }

    this.imageLoading.set(true);
    this.userService
      .uploadProfileImage(file)
      .pipe(finalize(() => this.imageLoading.set(false)))
      .subscribe({
        next: (user) => {
          this.store.dispatch(AuthActions.setUser({ user }));
          this.profileImageUrl.set(this.userService.imageUrl(user.profileImage));
          this.toastr.success('תמונת הפרופיל עודכנה');
        },
        error: (err: HttpErrorResponse) => {
          this.toastr.error(err.error?.message ?? 'אירעה שגיאה בהעלאת התמונה');
        },
      });
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.userService
      .getProfile()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (user) => {
          this.patchForm(user);
        },
        error: () => {
          const cached = this.authService.currentUser();
          if (cached) {
            this.patchForm(cached);
          } else {
            this.toastr.error('לא ניתן לטעון את הפרופיל');
          }
        },
      });
  }

  private calculateBmr(gender: string, age: number, weight: number, height: number): number {
    const maleBmr = 10 * weight + 6.25 * height - 5 * age + 5;
    const femaleBmr = 10 * weight + 6.25 * height - 5 * age - 161;

    if (gender === 'male') {
      return maleBmr;
    }

    if (gender === 'female') {
      return femaleBmr;
    }

    return (maleBmr + femaleBmr) / 2;
  }

  private patchForm(user: {
    name: string;
    email: string;
    calorieGoal: number;
    age?: number;
    gender?: string;
    weight?: number;
    height?: number;
    profileImage?: string;
  }): void {
    this.email.set(user.email);
    this.profileImageUrl.set(this.userService.imageUrl(user.profileImage));
    this.form.patchValue({
      name: user.name,
      calorieGoal: user.calorieGoal,
      age: user.age ?? null,
      gender: user.gender ?? '',
      weight: user.weight ?? null,
      height: user.height ?? null,
    });
  }
}
