import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';

export interface Device {
  id: number;
  device_uuid: string;
  device_name: string;
  user_id: number;
  status: 'online' | 'offline' | 'unknown';
  last_position_id?: number;
  created_at: string;
  updated_at: string;
  last_position?: {
    latitude: number;
    longitude: number;
    timestamp: string;
    speed?: number;
    heading?: number;
    accuracy?: number;
  };
}

export interface DevicePosition {
  id: number;
  device_id: number;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  timestamp: string;
  is_active: boolean;
}

export interface DeviceStatistics {
  total_positions: number;
  today_positions: number;
  average_speed: number;
  max_speed?: number;
  total_distance?: number;
  last_active?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DeviceService {
  private apiUrl = 'https://rno-back-websig.onrender.com/api/devices';
  private positionsUrl = 'https://rno-back-websig.onrender.com/api/positions';
  
  // Behavior subjects for real-time updates
  private devicesSubject = new BehaviorSubject<Device[]>([]);
  public devices$ = this.devicesSubject.asObservable();
  
  private selectedDeviceSubject = new BehaviorSubject<Device | null>(null);
  public selectedDevice$ = this.selectedDeviceSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get all devices for current user
   */
  getDevices(): Observable<Device[]> {
    return this.http.get<{ success: boolean; devices: Device[] }>(this.apiUrl)
      .pipe(
        map(response => response.devices || response as any),
        tap(devices => {
          this.devicesSubject.next(devices);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get device by ID
   */
  getDevice(id: number): Observable<Device> {
    return this.http.get<{ success: boolean; device: Device }>(`${this.apiUrl}/${id}`)
      .pipe(
        map(response => response.device),
        catchError(this.handleError)
      );
  }

  /**
   * Get device by UUID
   */
  getDeviceByUuid(uuid: string): Observable<Device> {
    return this.http.get<{ success: boolean; device: Device }>(`${this.apiUrl}/uuid/${uuid}`)
      .pipe(
        map(response => response.device),
        catchError(this.handleError)
      );
  }

  /**
   * Register a new device
   */
  registerDevice(deviceUuid: string, deviceName: string): Observable<Device> {
    const deviceData = { deviceUuid, deviceName };
    
    return this.http.post<{ success: boolean; device: Device }>(this.apiUrl, deviceData)
      .pipe(
        tap(response => {
          const currentDevices = this.devicesSubject.value;
          this.devicesSubject.next([...currentDevices, response.device]);
        }),
        map(response => response.device),
        catchError(this.handleError)
      );
  }

  /**
   * Update device information
   */
  updateDevice(id: number, deviceData: Partial<Device>): Observable<Device> {
    return this.http.put<{ success: boolean; device: Device }>(`${this.apiUrl}/${id}`, deviceData)
      .pipe(
        tap(response => {
          const currentDevices = this.devicesSubject.value;
          const index = currentDevices.findIndex(d => d.id === id);
          if (index !== -1) {
            currentDevices[index] = response.device;
            this.devicesSubject.next([...currentDevices]);
          }
        }),
        map(response => response.device),
        catchError(this.handleError)
      );
  }

  /**
   * Delete a device
   */
  deleteDevice(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`)
      .pipe(
        tap(() => {
          const currentDevices = this.devicesSubject.value;
          const filteredDevices = currentDevices.filter(d => d.id !== id);
          this.devicesSubject.next(filteredDevices);
          
          // Clear selected device if it was deleted
          const selected = this.selectedDeviceSubject.value;
          if (selected && selected.id === id) {
            this.selectedDeviceSubject.next(null);
          }
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get device position history
   */
  getDeviceHistory(deviceId: number, limit: number = 100, startDate?: Date, endDate?: Date): Observable<DevicePosition[]> {
    let params = new HttpParams().set('limit', limit.toString());
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; history: DevicePosition[] }>(`${this.apiUrl}/${deviceId}/history`, { params })
      .pipe(
        map(response => response.history),
        catchError(this.handleError)
      );
  }

  /**
   * Get last position of a device
   */
  getLastPosition(deviceId: number): Observable<DevicePosition | null> {
    return this.http.get<{ success: boolean; position: DevicePosition | null }>(`${this.apiUrl}/${deviceId}/last-position`)
      .pipe(
        map(response => response.position),
        catchError(this.handleError)
      );
  }

  /**
   * Get last positions for all devices
   */
  getAllLastPositions(): Observable<DevicePosition[]> {
    return this.http.get<{ success: boolean; positions: DevicePosition[] }>(`${this.positionsUrl}/last`)
      .pipe(
        map(response => response.positions),
        catchError(this.handleError)
      );
  }

  /**
   * Get device statistics
   */
  getDeviceStatistics(deviceId: number): Observable<DeviceStatistics> {
    return this.http.get<{ success: boolean; statistics: DeviceStatistics }>(`${this.positionsUrl}/statistics/${deviceId}`)
      .pipe(
        map(response => response.statistics),
        catchError(this.handleError)
      );
  }

  /**
   * Save position from mobile device
   */
  savePosition(deviceId: number, position: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    altitude?: number;
  }): Observable<DevicePosition> {
    return this.http.post<{ success: boolean; position: DevicePosition }>(this.positionsUrl, {
      deviceId,
      ...position
    }).pipe(
      map(response => response.position),
      catchError(this.handleError)
    );
  }

  /**
   * Get devices by status
   */
  getDevicesByStatus(status: string): Observable<Device[]> {
    return this.http.get<{ success: boolean; devices: Device[] }>(`${this.apiUrl}/status/${status}`)
      .pipe(
        map(response => response.devices),
        catchError(this.handleError)
      );
  }

  /**
   * Update device status
   */
  updateDeviceStatus(deviceId: number, status: 'online' | 'offline'): Observable<Device> {
    return this.http.patch<{ success: boolean; device: Device }>(`${this.apiUrl}/${deviceId}/status`, { status })
      .pipe(
        tap(response => {
          const currentDevices = this.devicesSubject.value;
          const index = currentDevices.findIndex(d => d.id === deviceId);
          if (index !== -1) {
            currentDevices[index].status = status;
            this.devicesSubject.next([...currentDevices]);
          }
        }),
        map(response => response.device),
        catchError(this.handleError)
      );
  }

  /**
   * Get active devices (online and recently active)
   */
  getActiveDevices(minutesActive: number = 5): Observable<Device[]> {
    return this.http.get<{ success: boolean; devices: Device[] }>(`${this.apiUrl}/active/${minutesActive}`)
      .pipe(
        map(response => response.devices),
        catchError(this.handleError)
      );
  }

  /**
   * Search devices by name or UUID
   */
  searchDevices(query: string): Observable<Device[]> {
    return this.http.get<{ success: boolean; devices: Device[] }>(`${this.apiUrl}/search/${query}`)
      .pipe(
        map(response => response.devices),
        catchError(this.handleError)
      );
  }

  /**
   * Get device count statistics
   */
  getDeviceStats(): Observable<{
    total: number;
    online: number;
    offline: number;
    active: number;
  }> {
    return this.http.get<{ success: boolean; stats: any }>(`${this.apiUrl}/stats`)
      .pipe(
        map(response => response.stats),
        catchError(this.handleError)
      );
  }

  /**
   * Set selected device
   */
  setSelectedDevice(device: Device | null): void {
    this.selectedDeviceSubject.next(device);
  }

  /**
   * Get selected device
   */
  getSelectedDevice(): Device | null {
    return this.selectedDeviceSubject.value;
  }

  /**
   * Refresh devices list
   */
  refreshDevices(): void {
    this.getDevices().subscribe();
  }

  /**
   * Export devices data
   */
  exportDevices(format: 'json' | 'csv' = 'json'): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export/${format}`, {
      responseType: 'blob'
    }).pipe(catchError(this.handleError));
  }

  /**
   * Generate device QR code
   */
  generateDeviceQR(deviceId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${deviceId}/qrcode`, {
      responseType: 'blob'
    }).pipe(catchError(this.handleError));
  }

  /**
   * Error handler
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred with device service';
    
    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message;
    } else {
      errorMessage = error.error?.error || error.error?.message || `Error ${error.status}: ${error.statusText}`;
    }
    
    console.error('DeviceService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Format device status for display
   */
  formatStatus(status: string): string {
    switch(status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  }

  /**
   * Get status color class
   */
  getStatusColor(status: string): string {
    switch(status) {
      case 'online': return 'success';
      case 'offline': return 'danger';
      default: return 'secondary';
    }
  }

  /**
   * Get status icon
   */
  getStatusIcon(status: string): string {
    switch(status) {
      case 'online': return 'bi-wifi';
      case 'offline': return 'bi-wifi-off';
      default: return 'bi-question-circle';
    }
  }

  /**
   * Calculate distance between two positions (in km)
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  /**
   * Calculate total distance from position history
   */
  calculateTotalDistance(positions: DevicePosition[]): number {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i-1];
      const curr = positions[i];
      total += this.calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    }
    return total;
  }

  /**
   * Get average speed from positions
   */
  getAverageSpeed(positions: DevicePosition[]): number {
    const speeds = positions.filter(p => p.speed).map(p => p.speed!);
    if (speeds.length === 0) return 0;
    return speeds.reduce((a, b) => a + b, 0) / speeds.length;
  }
}