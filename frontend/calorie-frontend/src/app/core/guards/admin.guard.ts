// זהו Guard של Angular שמגן על נתיבים של מנהלים. הוא בודק שהמשתמש מחובר ושיש לו הרשאת Admin לפני כניסה לעמוד, ואם אין הרשאה הוא חוסם את הגישה ומעביר אותו לעמוד מתאים.
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toastr = inject(ToastrService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.currentUser()?.role === 'admin') {
    return true;
  }

  toastr.error('אין לך הרשאה');
  return router.createUrlTree(['/dashboard']);
};
