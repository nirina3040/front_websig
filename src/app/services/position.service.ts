import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface Position {
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

export interface PositionWithDevice extends Position {
  device_name: string;
  device_uuid: string;
  device_status: string;
}

export interface PositionStatistics {
  total_positions: number;
  today_positions: number;
  average_speed: number;
  max_speed: number;
  min_speed: number;
  total_distance: number;
  average_accuracy: number;
  last_active: string;
  first_active: string;
}

export interface PositionBounds {
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
}

export interface PositionHeatmapData {
  lat: number;
  lng: number;
  weight: number;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class PositionService {
  private apiUrl = 'http://localhost:3000/api/positions';
  
  // Behavior subjects for real-time updates
  private lastPositionsSubject = new BehaviorSubject<PositionWithDevice[]>([]);
  public lastPositions$ = this.lastPositionsSubject.asObservable();
  
  private currentPositionSubject = new BehaviorSubject<Position | null>(null);
  public currentPosition$ = this.currentPositionSubject.asObservable();
  
  private positionHistorySubject = new BehaviorSubject<Position[]>([]);
  public positionHistory$ = this.positionHistorySubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Save a new position (used by mobile app)
   */
  savePosition(positionData: {
    deviceId: number;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    altitude?: number;
  }): Observable<Position> {
    return this.http.post<{ success: boolean; position: Position }>(this.apiUrl, positionData)
      .pipe(
        map(response => response.position),
        tap(position => {
          this.currentPositionSubject.next(position);
          this.updateLastPositions();
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get all last positions for all devices of current user
   */
  getAllLastPositions(): Observable<PositionWithDevice[]> {
    return this.http.get<{ success: boolean; positions: PositionWithDevice[] }>(`${this.apiUrl}/last`)
      .pipe(
        map(response => response.positions),
        tap(positions => {
          this.lastPositionsSubject.next(positions);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get last position for a specific device
   */
  getLastPosition(deviceId: number): Observable<Position | null> {
    return this.http.get<{ success: boolean; position: Position | null }>(`${this.apiUrl}/latest/${deviceId}`)
      .pipe(
        map(response => response.position),
        tap(position => {
          this.currentPositionSubject.next(position);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get position history for a device
   */
  getPositionHistory(
    deviceId: number, 
    limit: number = 100, 
    offset: number = 0,
    startDate?: Date, 
    endDate?: Date
  ): Observable<Position[]> {
    let params = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; history: Position[] }>(`${this.apiUrl}/history/${deviceId}`, { params })
      .pipe(
        map(response => response.history),
        tap(history => {
          this.positionHistorySubject.next(history);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Get position history with pagination
   */
  getPositionHistoryPaginated(
    deviceId: number,
    page: number = 1,
    pageSize: number = 50,
    startDate?: Date,
    endDate?: Date
  ): Observable<{ positions: Position[]; total: number; page: number; totalPages: number }> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString())
      .set('startDate', startDate ? startDate.toISOString() : '')
      .set('endDate', endDate ? endDate.toISOString() : '');
    
    return this.http.get<{ 
      success: boolean; 
      positions: Position[]; 
      total: number; 
      page: number; 
      totalPages: number 
    }>(`${this.apiUrl}/history/${deviceId}/paginated`, { params })
      .pipe(
        map(response => ({
          positions: response.positions,
          total: response.total,
          page: response.page,
          totalPages: response.totalPages
        })),
        catchError(this.handleError)
      );
  }

  /**
   * Get position statistics for a device
   */
  getPositionStatistics(deviceId: number): Observable<PositionStatistics> {
    return this.http.get<{ success: boolean; statistics: PositionStatistics }>(`${this.apiUrl}/statistics/${deviceId}`)
      .pipe(
        map(response => response.statistics),
        catchError(this.handleError)
      );
  }

  /**
   * Get positions within a bounding box
   */
  getPositionsInBounds(
    deviceId: number,
    bounds: PositionBounds,
    startDate?: Date,
    endDate?: Date
  ): Observable<Position[]> {
    const params = new HttpParams()
      .set('minLat', bounds.min_latitude.toString())
      .set('maxLat', bounds.max_latitude.toString())
      .set('minLng', bounds.min_longitude.toString())
      .set('maxLng', bounds.max_longitude.toString())
      .set('startDate', startDate ? startDate.toISOString() : '')
      .set('endDate', endDate ? endDate.toISOString() : '');
    
    return this.http.get<{ success: boolean; positions: Position[] }>(`${this.apiUrl}/bounds/${deviceId}`, { params })
      .pipe(
        map(response => response.positions),
        catchError(this.handleError)
      );
  }

  /**
   * Get positions within a radius
   */
  getPositionsInRadius(
    deviceId: number,
    latitude: number,
    longitude: number,
    radiusKm: number,
    startDate?: Date,
    endDate?: Date
  ): Observable<Position[]> {
    const params = new HttpParams()
      .set('lat', latitude.toString())
      .set('lng', longitude.toString())
      .set('radius', radiusKm.toString())
      .set('startDate', startDate ? startDate.toISOString() : '')
      .set('endDate', endDate ? endDate.toISOString() : '');
    
    return this.http.get<{ success: boolean; positions: Position[] }>(`${this.apiUrl}/radius/${deviceId}`, { params })
      .pipe(
        map(response => response.positions),
        catchError(this.handleError)
      );
  }

  /**
   * Get heatmap data for visualization
   */
  getHeatmapData(
    deviceId: number,
    startDate?: Date,
    endDate?: Date
  ): Observable<PositionHeatmapData[]> {
    let params = new HttpParams();
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; data: PositionHeatmapData[] }>(`${this.apiUrl}/heatmap/${deviceId}`, { params })
      .pipe(
        map(response => response.data),
        catchError(this.handleError)
      );
  }

  /**
   * Get latest positions for multiple devices
   */
  getMultipleLastPositions(deviceIds: number[]): Observable<PositionWithDevice[]> {
    return this.http.post<{ success: boolean; positions: PositionWithDevice[] }>(`${this.apiUrl}/last-multiple`, { deviceIds })
      .pipe(
        map(response => response.positions),
        catchError(this.handleError)
      );
  }

  /**
   * Delete old positions (cleanup)
   */
  deleteOldPositions(deviceId: number, olderThanDays: number): Observable<{ deleted: number }> {
    return this.http.delete<{ success: boolean; deleted: number }>(`${this.apiUrl}/cleanup/${deviceId}`, {
      params: { days: olderThanDays.toString() }
    }).pipe(
      map(response => ({ deleted: response.deleted })),
      catchError(this.handleError)
    );
  }

  /**
   * Export positions to file
   */
  exportPositions(
    deviceId: number,
    format: 'json' | 'csv' | 'gpx' = 'json',
    startDate?: Date,
    endDate?: Date
  ): Observable<Blob> {
    let params = new HttpParams().set('format', format);
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get(`${this.apiUrl}/export/${deviceId}`, {
      params,
      responseType: 'blob'
    }).pipe(catchError(this.handleError));
  }

  /**
   * Get real-time positions (WebSocket alternative)
   */
  getRealtimePositions(deviceId: number, intervalMs: number = 5000): Observable<Position> {
    return new Observable(observer => {
      const interval = setInterval(() => {
        this.getLastPosition(deviceId).subscribe({
          next: (position) => {
            if (position) {
              observer.next(position);
            }
          },
          error: (error) => observer.error(error)
        });
      }, intervalMs);
      
      return () => clearInterval(interval);
    });
  }

  /**
   * Calculate route from position history
   */
  calculateRoute(deviceId: number, startDate: Date, endDate: Date): Observable<{
    positions: Position[];
    distance: number;
    duration: number;
    average_speed: number;
    max_speed: number;
  }> {
    const params = new HttpParams()
      .set('startDate', startDate.toISOString())
      .set('endDate', endDate.toISOString());
    
    return this.http.get<{ success: boolean; route: any }>(`${this.apiUrl}/route/${deviceId}`, { params })
      .pipe(
        map(response => response.route),
        catchError(this.handleError)
      );
  }

  /**
   * Get position summary by date
   */
  getPositionSummary(deviceId: number, date: Date): Observable<{
    date: string;
    total_positions: number;
    total_distance: number;
    average_speed: number;
    max_speed: number;
    start_position: Position | null;
    end_position: Position | null;
  }> {
    const params = new HttpParams().set('date', date.toISOString());
    
    return this.http.get<{ success: boolean; summary: any }>(`${this.apiUrl}/summary/${deviceId}`, { params })
      .pipe(
        map(response => response.summary),
        catchError(this.handleError)
      );
  }

  /**
   * Compare two devices' paths
   */
  comparePaths(deviceId1: number, deviceId2: number, date: Date): Observable<{
    device1: { positions: Position[]; distance: number };
    device2: { positions: Position[]; distance: number };
    meeting_points: Position[];
    proximity_events: any[];
  }> {
    const params = new HttpParams().set('date', date.toISOString());
    
    return this.http.get<{ success: boolean; comparison: any }>(
      `${this.apiUrl}/compare/${deviceId1}/${deviceId2}`, 
      { params }
    ).pipe(
      map(response => response.comparison),
      catchError(this.handleError)
    );
  }

  /**
   * Get geofence alerts
   */
  getGeofenceAlerts(deviceId: number, startDate?: Date, endDate?: Date): Observable<any[]> {
    let params = new HttpParams();
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; alerts: any[] }>(`${this.apiUrl}/geofence-alerts/${deviceId}`, { params })
      .pipe(
        map(response => response.alerts),
        catchError(this.handleError)
      );
  }

  /**
   * Update last positions cache
   */
  private updateLastPositions(): void {
    this.getAllLastPositions().subscribe();
  }

  /**
   * Clear position history cache
   */
  clearPositionHistory(): void {
    this.positionHistorySubject.next([]);
    this.currentPositionSubject.next(null);
  }

  /**
   * Calculate distance between two positions (Haversine formula)
   */
  calculateDistance(pos1: Position, pos2: Position): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(pos2.latitude - pos1.latitude);
    const dLon = this.deg2rad(pos2.longitude - pos1.longitude);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(pos1.latitude)) * Math.cos(this.deg2rad(pos2.latitude)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate total distance from position array
   */
  calculateTotalDistance(positions: Position[]): number {
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      total += this.calculateDistance(positions[i-1], positions[i]);
    }
    return total;
  }

  /**
   * Calculate average speed from positions
   */
  calculateAverageSpeed(positions: Position[]): number {
    const validSpeeds = positions.filter(p => p.speed && p.speed > 0).map(p => p.speed!);
    if (validSpeeds.length === 0) return 0;
    return validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length;
  }

  /**
   * Get the bounds of a set of positions
   */
  getPositionsBounds(positions: Position[]): PositionBounds | null {
    if (positions.length === 0) return null;
    
    let minLat = positions[0].latitude;
    let maxLat = positions[0].latitude;
    let minLng = positions[0].longitude;
    let maxLng = positions[0].longitude;
    
    for (const pos of positions) {
      minLat = Math.min(minLat, pos.latitude);
      maxLat = Math.max(maxLat, pos.latitude);
      minLng = Math.min(minLng, pos.longitude);
      maxLng = Math.max(maxLng, pos.longitude);
    }
    
    return {
      min_latitude: minLat,
      max_latitude: maxLat,
      min_longitude: minLng,
      max_longitude: maxLng
    };
  }

  /**
   * Convert degrees to radians
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Convert speed from m/s to km/h
   */
  msToKmh(speedMs: number): number {
    return speedMs * 3.6;
  }

  /**
   * Convert speed from km/h to m/s
   */
  kmhToMs(speedKmh: number): number {
    return speedKmh / 3.6;
  }

  /**
   * Format position for display
   */
  formatPosition(position: Position): string {
    return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
  }

  /**
   * Format coordinates as Google Maps URL
   */
  getGoogleMapsUrl(position: Position): string {
    return `https://www.google.com/maps?q=${position.latitude},${position.longitude}`;
  }

  /**
   * Format coordinates as OpenStreetMap URL
   */
  getOpenStreetMapUrl(position: Position): string {
    return `https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=15/${position.latitude}/${position.longitude}`;
  }

  /**
   * Check if position is stale (older than specified minutes)
   */
  isPositionStale(position: Position, minutes: number = 5): boolean {
    const timestamp = new Date(position.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - timestamp.getTime()) / 1000 / 60;
    return diffMinutes > minutes;
  }

  /**
   * Get time since last update
   */
  getTimeSinceUpdate(position: Position | null): string {
    if (!position) return 'Never';
    
    const timestamp = new Date(position.timestamp);
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  /**
   * Get accuracy class for display
   */
  getAccuracyClass(accuracy: number | undefined): string {
    if (!accuracy) return 'text-secondary';
    if (accuracy < 10) return 'text-success';
    if (accuracy < 50) return 'text-warning';
    return 'text-danger';
  }

  /**
   * Get accuracy description
   */
  getAccuracyDescription(accuracy: number | undefined): string {
    if (!accuracy) return 'Unknown';
    if (accuracy < 10) return 'Excellent';
    if (accuracy < 20) return 'Very Good';
    if (accuracy < 50) return 'Good';
    if (accuracy < 100) return 'Fair';
    return 'Poor';
  }

  /**
   * Error handler
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'An error occurred with position service';
    
    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message;
    } else {
      errorMessage = error.error?.error || error.error?.message || `Error ${error.status}: ${error.statusText}`;
    }
    
    console.error('PositionService Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * Batch save multiple positions (for offline sync)
   */
  batchSavePositions(positions: Array<{
    deviceId: number;
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    altitude?: number;
    timestamp: string;
  }>): Observable<{ saved: number; errors: any[] }> {
    return this.http.post<{ success: boolean; saved: number; errors: any[] }>(`${this.apiUrl}/batch`, { positions })
      .pipe(
        map(response => ({ saved: response.saved, errors: response.errors })),
        catchError(this.handleError)
      );
  }

  /**
   * Get position history grouped by hour/day/week
   */
  getGroupedHistory(
    deviceId: number,
    groupBy: 'hour' | 'day' | 'week' | 'month',
    startDate?: Date,
    endDate?: Date
  ): Observable<{ group: string; count: number; positions: Position[] }[]> {
    let params = new HttpParams().set('groupBy', groupBy);
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; groups: any[] }>(`${this.apiUrl}/grouped/${deviceId}`, { params })
      .pipe(
        map(response => response.groups),
        catchError(this.handleError)
      );
  }

  /**
   * Get speed statistics
   */
  getSpeedStatistics(deviceId: number, startDate?: Date, endDate?: Date): Observable<{
    min_speed: number;
    max_speed: number;
    avg_speed: number;
    speed_distribution: { range: string; count: number }[];
  }> {
    let params = new HttpParams();
    
    if (startDate) {
      params = params.set('startDate', startDate.toISOString());
    }
    if (endDate) {
      params = params.set('endDate', endDate.toISOString());
    }
    
    return this.http.get<{ success: boolean; stats: any }>(`${this.apiUrl}/speed-stats/${deviceId}`, { params })
      .pipe(
        map(response => response.stats),
        catchError(this.handleError)
      );
  }

  /**
   * Get positions by date range (simplified)
   */
  getPositionsByDateRange(deviceId: number, startDate: Date, endDate: Date): Observable<Position[]> {
    return this.getPositionHistory(deviceId, 10000, 0, startDate, endDate);
  }

  /**
   * Get latest position timestamp
   */
  getLatestTimestamp(deviceId: number): Observable<string | null> {
    return this.getLastPosition(deviceId).pipe(
      map(position => position?.timestamp || null)
    );
  }

  /**
   * Check if device has recent positions
   */
  hasRecentPositions(deviceId: number, minutesThreshold: number = 5): Observable<boolean> {
    return this.getLastPosition(deviceId).pipe(
      map(position => {
        if (!position) return false;
        const lastUpdate = new Date(position.timestamp);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastUpdate.getTime()) / 1000 / 60;
        return diffMinutes <= minutesThreshold;
      })
    );
  }
}