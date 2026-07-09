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

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

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

  readonly genderOptions = [
    { value: 'male', label: 'זכר' },
    { value: 'female', label: 'נקבה' },
    { value: 'other', label: 'אחר' },
  ];

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
