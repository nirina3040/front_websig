import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  showPassword = false;
  showConfirmPassword = false;
  acceptedTerms = false;
  passwordStrength = 0;
  passwordStrengthText = '';
  passwordStrengthClass = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if user is already logged in
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }

    // Initialize form with validators
    this.registerForm = this.fb.group({
      username: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50),
        Validators.pattern('^[a-zA-Z0-9_]+$')
      ]],
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.pattern('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$')
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', [
        Validators.required
      ]],
      terms: [false, Validators.requiredTrue]
    }, {
      validator: this.passwordMatchValidator
    });

    // Listen to password changes for strength meter
    this.registerForm.get('password')?.valueChanges.subscribe(value => {
      this.updatePasswordStrength(value);
    });
  }

  // Custom validator for password strength
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.value;
    if (!password) return null;

    const errors: any = {};
    let strength = 0;

    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;

    if (strength < 2) errors.weak = true;
    if (strength < 3 && strength >= 2) errors.fair = true;
    if (strength < 4 && strength >= 3) errors.good = true;

    return Object.keys(errors).length ? errors : null;
  }

  // Custom validator for password match
  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    
    if (password !== confirmPassword) {
      form.get('confirmPassword')?.setErrors({ mismatch: true });
      return { mismatch: true };
    }
    return null;
  }

  // Update password strength meter
  updatePasswordStrength(password: string) {
    if (!password) {
      this.passwordStrength = 0;
      this.passwordStrengthText = '';
      this.passwordStrengthClass = '';
      return;
    }

    let strength = 0;
    let text = '';
    let colorClass = '';

    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/)) strength++;
    if (password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;

    if (strength <= 2) {
      text = 'Weak';
      colorClass = 'bg-danger';
    } else if (strength === 3) {
      text = 'Fair';
      colorClass = 'bg-warning';
    } else if (strength === 4) {
      text = 'Good';
      colorClass = 'bg-info';
    } else if (strength === 5) {
      text = 'Strong';
      colorClass = 'bg-success';
    }

    this.passwordStrength = (strength / 5) * 100;
    this.passwordStrengthText = text;
    this.passwordStrengthClass = colorClass;
  }

  // Convenience getter
  get f() { return this.registerForm.controls; }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      // Mark all fields as touched to show errors
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const { username, email, password } = this.registerForm.value;

    this.authService.register(username, email, password).subscribe({
      next: (response) => {
        this.isLoading = false;
        // Show success message and redirect to dashboard
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Registration failed. Please try again.';
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // Helper method to get password strength indicator width
  getPasswordStrengthWidth(): string {
    return `${this.passwordStrength}%`;
  }
}