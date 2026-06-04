import { Injectable, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { AuthService } from './auth.service';

export interface LocationData {
  deviceUuid: string;
  deviceId: number;
  deviceName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  timestamp: string;
}

export interface DeviceStatusData {
  deviceUuid: string;
  deviceId: number;
  deviceName?: string;
  status: 'online' | 'offline';
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  socketId?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService implements OnDestroy {
  private socket: Socket | undefined;
  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();
  
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>({ connected: false });
  public connectionStatus$ = this.connectionStatusSubject.asObservable();
  
  private locationSubject = new Subject<LocationData>();
  private deviceStatusSubject = new Subject<DeviceStatusData>();
  
  private subscribedDevices: Map<string, boolean> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval: any;

  constructor(private authService: AuthService) {
    this.initSocket();
  }

  /**
   * Initialize socket connection
   */
  private initSocket(): void {
    const token = this.authService.getToken();
    
    if (!token) {
      console.warn('No token available for socket connection');
      return;
    }
    
    this.socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    this.setupSocketListeners();
  }

  /**
   * Setup socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;
    
    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.connectedSubject.next(true);
      this.connectionStatusSubject.next({ 
        connected: true, 
        socketId: this.socket?.id 
      });
      this.reconnectAttempts = 0;
      
      // Resubscribe to previously subscribed devices
      this.resubscribeToDevices();
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      this.connectedSubject.next(false);
      this.connectionStatusSubject.next({ 
        connected: false, 
        error: reason 
      });
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      
      this.connectionStatusSubject.next({ 
        connected: false, 
        error: error.message 
      });
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.connectionStatusSubject.next({ 
        connected: this.connectedSubject.value, 
        error: error.message 
      });
    });
    
    // Location update listener
    this.socket.on('location:update', (data: LocationData) => {
      console.log('Location update received:', data);
      this.locationSubject.next(data);
    });
    
    // Device status change listener
    this.socket.on('device:status', (data: DeviceStatusData) => {
      console.log('Device status change:', data);
      this.deviceStatusSubject.next(data);
    });
    
    // Generic device location listener (for specific device subscriptions)
    this.socket.onAny((eventName, ...args) => {
      if (eventName.startsWith('device:') && eventName.endsWith(':location')) {
        const deviceUuid = eventName.split(':')[1];
        const locationData = args[0] as LocationData;
        this.locationSubject.next({ ...locationData, deviceUuid });
      }
    });
  }

  /**
   * Resubscribe to devices after reconnection
   */
  private resubscribeToDevices(): void {
    this.subscribedDevices.forEach((_, deviceUuid) => {
      this.subscribeToDevice(deviceUuid);
    });
  }

  /**
   * Subscribe to device location updates
   */
  subscribeToDevice(deviceUuid: string): void {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }
    
    if (this.subscribedDevices.has(deviceUuid)) {
      console.log('Already subscribed to device:', deviceUuid);
      return;
    }
    
    this.socket.emit('subscribe:device', { deviceUuid });
    this.subscribedDevices.set(deviceUuid, true);
    console.log('Subscribed to device:', deviceUuid);
  }

  /**
   * Unsubscribe from device location updates
   */
  unsubscribeFromDevice(deviceUuid: string): void {
    if (!this.socket) {
      return;
    }
    
    if (!this.subscribedDevices.has(deviceUuid)) {
      return;
    }
    
    this.socket.emit('unsubscribe:device', { deviceUuid });
    this.subscribedDevices.delete(deviceUuid);
    console.log('Unsubscribed from device:', deviceUuid);
  }

  /**
   * Send location update from mobile device
   */
  sendLocationUpdate(locationData: Omit<LocationData, 'timestamp'>): void {
    if (!this.socket) {
      console.warn('Socket not connected, cannot send location');
      return;
    }
    
    const data = {
      ...locationData,
      timestamp: new Date().toISOString()
    };
    
    this.socket.emit('location:update', data);
    console.log('Location update sent:', data);
  }

  /**
   * Send device status update
   */
  sendDeviceStatus(deviceUuid: string, status: 'online' | 'offline'): void {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }
    
    this.socket.emit('device:status', {
      deviceUuid,
      status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Observe location updates for a specific device
   */
  onDeviceLocation(deviceUuid: string): Observable<LocationData> {
    return new Observable(observer => {
      const handler = (data: LocationData) => {
        if (data.deviceUuid === deviceUuid) {
          observer.next(data);
        }
      };
      
      this.locationSubject.subscribe(handler);
      
      return () => {
        this.unsubscribeFromDevice(deviceUuid);
      };
    });
  }

  /**
   * Observe all location updates
   */
  onLocationUpdate(): Observable<LocationData> {
    return this.locationSubject.asObservable();
  }

  /**
   * Observe device status changes
   */
  onDeviceStatusChange(): Observable<DeviceStatusData> {
    return this.deviceStatusSubject.asObservable();
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.connectedSubject.value;
  }

  /**
   * Get socket ID
   */
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Disconnect socket
   */
  disconnect(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
    
    this.connectedSubject.next(false);
    this.subscribedDevices.clear();
    console.log('Socket disconnected manually');
  }

  /**
   * Reconnect socket
   */
  reconnect(): void {
    if (this.socket && !this.isConnected()) {
      this.socket.connect();
    } else if (!this.socket) {
      this.initSocket();
    }
  }

  /**
   * Get list of subscribed devices
   */
  getSubscribedDevices(): string[] {
    return Array.from(this.subscribedDevices.keys());
  }

  /**
   * Subscribe to multiple devices
   */
  subscribeToDevices(deviceUuids: string[]): void {
    deviceUuids.forEach(uuid => this.subscribeToDevice(uuid));
  }

  /**
   * Unsubscribe from all devices
   */
  unsubscribeFromAllDevices(): void {
    this.subscribedDevices.forEach((_, deviceUuid) => {
      this.unsubscribeFromDevice(deviceUuid);
    });
  }

  /**
   * Send heartbeat to keep connection alive
   */
  sendHeartbeat(): void {
    if (this.socket && this.isConnected()) {
      this.socket.emit('heartbeat', { timestamp: new Date().toISOString() });
    }
  }

  /**
   * Start automatic heartbeat
   */
  startHeartbeat(intervalMs: number = 30000): void {
    setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): { connected: boolean; subscribedDevices: number; socketId?: string } {
    return {
      connected: this.isConnected(),
      subscribedDevices: this.subscribedDevices.size,
      socketId: this.socket?.id
    };
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.locationSubject.complete();
    this.deviceStatusSubject.complete();
    this.connectedSubject.complete();
    this.connectionStatusSubject.complete();
  }
}