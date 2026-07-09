// זהו קובץ Unit Tests שבודק את תקינות ה־Guards של Angular. הוא מוודא שמשתמש מחובר מקבל גישה, משתמש לא מחובר מועבר ל־Login, ומשתמש מחובר לא יכול לחזור למסכי התחברות.
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('auth guards', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService],
    });

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    localStorage.clear();
  });

  it('authGuard allows authenticated users', () => {
    localStorage.setItem('token', 'jwt-token');

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/dashboard' } as never)
    );

    expect(result).toBeTrue();
  });

  it('authGuard redirects guests to login with returnUrl', () => {
    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/profile' } as never)
    ) as UrlTree;

    expect(result.toString()).toBe('/login?returnUrl=%2Fprofile');
  });

  it('guestGuard redirects authenticated users to dashboard', () => {
    localStorage.setItem('token', 'jwt-token');

    const result = TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never)) as UrlTree;

    expect(result.toString()).toBe('/dashboard');
  });
});
