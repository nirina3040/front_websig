import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { DeviceService } from '../../services/device.service';

@Component({
  selector: 'app-device-register',
  templateUrl: './device-register.component.html',
  styleUrls: ['./device-register.component.css']
})
export class DeviceRegisterComponent implements OnInit {
  registerForm!: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  generatedUuid = '';
  showUuidInfo = false;

  constructor(
    private fb: FormBuilder,
    private deviceService: DeviceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.generateDeviceUuid();
    this.initForm();
  }

  initForm(): void {
    this.registerForm = this.fb.group({
      deviceName: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(50),
        Validators.pattern('^[a-zA-Z0-9\\s\\-_]+$')
      ]],
      deviceUuid: [{ value: this.generatedUuid, disabled: true }, [
        Validators.required
      ]],
      deviceType: ['mobile', Validators.required],
      description: ['', Validators.maxLength(200)],
      autoGenerateUuid: [true]
    });
  }

  generateDeviceUuid(): void {
    // Generate a unique UUID for the device
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    this.generatedUuid = uuid;
    this.registerForm?.get('deviceUuid')?.setValue(uuid);
  }

  onAutoGenerateChange(): void {
    const autoGenerate = this.registerForm.get('autoGenerateUuid')?.value;
    if (autoGenerate) {
      this.generateDeviceUuid();
      this.registerForm.get('deviceUuid')?.disable();
    } else {
      this.registerForm.get('deviceUuid')?.enable();
      this.registerForm.get('deviceUuid')?.setValue('');
    }
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const deviceUuid = this.registerForm.get('autoGenerateUuid')?.value 
      ? this.generatedUuid 
      : this.registerForm.get('deviceUuid')?.value;
    
    const deviceName = this.registerForm.get('deviceName')?.value;

    this.deviceService.registerDevice(deviceUuid, deviceName).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.successMessage = 'Device registered successfully!';
        
        setTimeout(() => {
          this.router.navigate(['/devices']);
        }, 2000);
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.error || 'Failed to register device. Please try again.';
      }
    });
  }

  copyUuid(): void {
    const uuid = this.registerForm.get('deviceUuid')?.value;
    if (uuid) {
      navigator.clipboard.writeText(uuid);
      this.showUuidInfo = true;
      setTimeout(() => {
        this.showUuidInfo = false;
      }, 2000);
    }
  }

  get f() {
    return this.registerForm.controls;
  }
}