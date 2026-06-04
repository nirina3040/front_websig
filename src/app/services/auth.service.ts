import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { Router } from '@angular/router';

export interface User {
  id: number;
  username: string;
  email: string;
  created_at?: string;
  last_login?: string;
  is_active?: boolean;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user: User;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://rno-back-websig.onrender.com/api/auth';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private tokenExpirationTimer: any;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadStoredUser();
  }

  /**
   * Load stored user data from localStorage
   */
  private loadStoredUser(): void {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    const expiration = localStorage.getItem('tokenExpiration');
    
    if (token && user && expiration) {
      const expirationDate = new Date(expiration);
      if (expirationDate > new Date()) {
        this.currentUserSubject.next(JSON.parse(user));
        this.setAutoLogout(expirationDate.getTime() - Date.now());
      } else {
        this.logout();
      }
    }
  }

  /**
   * Register a new user
   */
  register(username: string, email: string, password: string): Observable<AuthResponse> {
    const registerData: RegisterData = { username, email, password };
    
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, registerData)
      .pipe(
        tap(response => {
          if (response.success) {
            this.handleAuthentication(response);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Login user
   */
  login(email: string, password: string): Observable<AuthResponse> {
    const credentials: LoginCredentials = { email, password };
    
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(response => {
          if (response.success) {
            this.handleAuthentication(response);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Handle authentication response
   */
  private handleAuthentication(response: AuthResponse): void {
    const { token, user } = response;
    
    // Calculate token expiration (default 7 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);
    
    // Store in localStorage
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('tokenExpiration', expirationDate.toISOString());
    
    // Update behavior subject
    this.currentUserSubject.next(user);
    
    // Set auto logout
    this.setAutoLogout(7 * 24 * 60 * 60 * 1000); // 7 days
  }

  /**
   * Set auto logout timer
   */
  private setAutoLogout(duration: number): void {
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }
    this.tokenExpirationTimer = setTimeout(() => {
      this.logout();
    }, duration);
  }

  /**
   * Logout user
   */
  logout(): void {
    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tokenExpiration');
    
    // Clear behavior subject
    this.currentUserSubject.next(null);
    
    // Clear timeout
    if (this.tokenExpirationTimer) {
      clearTimeout(this.tokenExpirationTimer);
    }
    
    // Navigate to login
    this.router.navigate(['/login']);
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get authentication token
   */
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiration = localStorage.getItem('tokenExpiration');
    
    if (!token || !expiration) {
      return false;
    }
    
    const expirationDate = new Date(expiration);
    return expirationDate > new Date();
  }

  /**
   * Get user profile from server
   */
  getProfile(): Observable<User> {
    return this.http.get<{ success: boolean; user: User }>(`${this.apiUrl}/profile`)
      .pipe(
        map(response => response.user),
        catchError(this.handleError)
      );
  }

  /**
   * Update user profile
   */
  updateProfile(userData: Partial<User>): Observable<User> {
    return this.http.put<{ success: boolean; user: User }>(`${this.apiUrl}/profile`, userData)
      .pipe(
        map(response => {
          const updatedUser = response.user;
          const currentUser = this.getCurrentUser();
          if (currentUser) {
            const newUser = { ...currentUser, ...updatedUser };
            localStorage.setItem('user', JSON.stringify(newUser));
            this.currentUserSubject.next(newUser);
          }
          return updatedUser;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Change password
   */
  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, { currentPassword, newPassword })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Request password reset
   */
  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Reset password with token
   */
  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, { token, newPassword })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Verify email
   */
  verifyEmail(token: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/verify-email`, { token })
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Refresh token
   */
  refreshToken(): Observable<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh-token`, { refreshToken })
      .pipe(
        tap(response => {
          if (response.success) {
            localStorage.setItem('token', response.token);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Error handler
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      errorMessage = error.error?.error || error.error?.message || `Error ${error.status}: ${error.statusText}`;
    }
    
    console.error('AuthService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    const expiration = localStorage.getItem('tokenExpiration');
    if (!expiration) return true;
    
    const expirationDate = new Date(expiration);
    return expirationDate <= new Date();
  }

  /**
   * Get token expiration date
   */
  getTokenExpirationDate(): Date | null {
    const expiration = localStorage.getItem('tokenExpiration');
    return expiration ? new Date(expiration) : null;
  }

  /**
   * Get user role/permissions (if implemented)
   */
  getUserRole(): string {
    const user = this.getCurrentUser();
    // You can implement role-based logic here
    return user ? 'user' : 'guest';
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    // Implement permission checking logic
    const role = this.getUserRole();
    // Example permissions
    const permissions: { [key: string]: string[] } = {
      admin: ['view_devices', 'add_devices', 'delete_devices', 'view_reports'],
      user: ['view_devices', 'add_devices']
    };
    
    return permissions[role]?.includes(permission) || false;
  }
}