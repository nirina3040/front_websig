import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DeviceService, Device } from '../services/device.service';
import { SocketService } from '../services/socket.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  currentMapType = 'street';
  currentUser: any;
  devices: Device[] = [];
  selectedDevice: Device | null = null;
  isLoading = true;
  sidebarCollapsed = false;
  mobileMenuOpen = false;
  activeTab = 'map';
  isMobile = false;
  statistics: any = {
    total: 0,
    online: 0,
    offline: 0,
    active: 0
  };
  notifications: any[] = [];
  showNotifications = false;
  currentTime = new Date();
  showDeleteModal = false;
  deviceToDelete: Device | null = null;
  private intervalId: any;

  constructor(
    private authService: AuthService,
    private deviceService: DeviceService,
    private socketService: SocketService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkScreenSize();
    this.currentUser = this.authService.getCurrentUser();
    this.loadDevices();
    this.startClock();
    this.initSocketListeners();
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  // Détecter la taille de l'écran pour le mode mobile
  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.checkScreenSize();
  }

  checkScreenSize(): void {
    this.isMobile = window.innerWidth <= 768;
    if (!this.isMobile) {
      this.mobileMenuOpen = false;
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.closeMobileMenu();
  }

  startClock(): void {
    this.intervalId = setInterval(() => {
      this.currentTime = new Date();
    }, 1000);
  }

  initSocketListeners(): void {
    console.log('🔌 Initializing socket listeners...');
    
    this.socketService.onLocationUpdate().subscribe((data: any) => {
      console.log('📍 Dashboard received location update:', data);
      this.updateDeviceLocation(data);
      this.addNotification(`Device ${data.deviceName || data.deviceUuid} updated location`, 'info');
    });

    this.socketService.onDeviceStatusChange().subscribe((data: any) => {
      console.log('📊 Dashboard received status change:', data);
      this.updateDeviceStatus(data);
      this.addNotification(`Device ${data.deviceName || data.deviceUuid} is now ${data.status}`, 'warning');
    });
  }

  loadDevices(): void {
    this.isLoading = true;
    console.log('🔄 Loading devices...');
    
    this.deviceService.getDevices().subscribe({
      next: (response: any) => {
        this.devices = response.devices || response;
        console.log('✅ Devices loaded:', this.devices.length);
        
        this.loadStatistics();
        this.isLoading = false;
        
        this.devices.forEach(device => {
          console.log(`📡 Subscribing to device: ${device.device_uuid} (${device.device_name})`);
          this.socketService.subscribeToDevice(device.device_uuid);
        });
        
        if (this.devices.length > 0 && !this.selectedDevice) {
          this.selectedDevice = this.devices[0];
          this.socketService.subscribeToDevice(this.selectedDevice.device_uuid);
        }
      },
      error: (error) => {
        console.error('❌ Error loading devices:', error);
        this.isLoading = false;
        this.addNotification('Failed to load devices', 'error');
      }
    });
  }

  loadStatistics(): void {
    const onlineDevices = this.devices.filter(d => d.status === 'online').length;
    const offlineDevices = this.devices.filter(d => d.status === 'offline').length;
    const activeDevices = this.devices.filter(d => d.last_position && 
      new Date(d.last_position.timestamp).getTime() > Date.now() - 5 * 60 * 1000).length;
    
    this.statistics = {
      total: this.devices.length,
      online: onlineDevices,
      offline: offlineDevices,
      active: activeDevices,
      lastUpdate: new Date()
    };
    
    console.log('📊 Statistics updated:', this.statistics);
  }

  updateDeviceLocation(data: any): void {
    console.log('🔄 Updating device location:', data);
    
    const device = this.devices.find(d => d.device_uuid === data.deviceUuid);
    
    if (device) {
      const oldPosition = device.last_position;
      
      device.last_position = {
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp || new Date().toISOString(),
        speed: data.speed,
        heading: data.heading,
        accuracy: data.accuracy
      };
      
      console.log(`✅ Device ${device.device_name} location updated:`);
      console.log(`   New: ${data.latitude}, ${data.longitude}`);
      
      this.devices = [...this.devices];
      this.loadStatistics();
      
      const event = new CustomEvent('deviceLocationUpdate', { 
        detail: { device, position: device.last_position } 
      });
      window.dispatchEvent(event);
      
      if (this.selectedDevice?.id === device.id) {
        const centerEvent = new CustomEvent('centerMapOnDevice', {
          detail: { 
            lat: data.latitude, 
            lng: data.longitude, 
            device: device 
          }
        });
        window.dispatchEvent(centerEvent);
      }
    } else {
      console.warn(`⚠️ Device not found for UUID: ${data.deviceUuid}`);
    }
  }

  updateDeviceStatus(data: any): void {
    console.log('📊 Updating device status:', data);
    
    const device = this.devices.find(d => d.device_uuid === data.deviceUuid);
    
    if (device) {
      device.status = data.status;
      console.log(`✅ Device ${device.device_name} status changed to: ${data.status}`);
      this.loadStatistics();
    } else {
      console.warn(`⚠️ Device not found for UUID: ${data.deviceUuid}`);
    }
  }

  selectDevice(device: Device): void {
    console.log(`🎯 Device selected: ${device.device_name} (${device.device_uuid})`);
    
    this.selectedDevice = device;
    this.setActiveTab('map');
    this.socketService.subscribeToDevice(device.device_uuid);
    
    if (device.last_position) {
      const event = new CustomEvent('centerMapOnDevice', {
        detail: { 
          lat: device.last_position.latitude, 
          lng: device.last_position.longitude, 
          device: device 
        }
      });
      window.dispatchEvent(event);
    }
  }

  toggleSidebar(): void {
    if (!this.isMobile) {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    }
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
  }

  getUnreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  addNotification(message: string, type: string): void {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date(),
      read: false
    };
    this.notifications.unshift(notification);
    console.log(`🔔 Notification: ${message} (${type})`);
    
    if (this.notifications.length > 50) {
      this.notifications.pop();
    }
    
    setTimeout(() => {
      notification.read = true;
    }, 5000);
  }

  markNotificationAsRead(id: number): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
    }
  }

  clearNotifications(): void {
    this.notifications = [];
  }

  confirmDelete(device: Device): void {
    this.deviceToDelete = device;
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.deviceToDelete = null;
  }

  deleteDevice(): void {
    if (this.deviceToDelete) {
      console.log(`🗑️ Deleting device: ${this.deviceToDelete.device_name}`);
      
      this.deviceService.deleteDevice(this.deviceToDelete.id).subscribe({
        next: () => {
          console.log(`✅ Device deleted: ${this.deviceToDelete?.device_name}`);
          this.devices = this.devices.filter(d => d.id !== this.deviceToDelete?.id);
          this.loadStatistics();
          this.closeDeleteModal();
          this.addNotification(`Device ${this.deviceToDelete?.device_name} deleted`, 'success');
          
          if (this.selectedDevice?.id === this.deviceToDelete?.id) {
            this.selectedDevice = null;
            if (this.devices.length > 0) {
              this.selectDevice(this.devices[0]);
            }
          }
        },
        error: (error) => {
          console.error('❌ Error deleting device:', error);
          this.addNotification('Failed to delete device', 'error');
        }
      });
    }
  }

  refreshData(): void {
    console.log('🔄 Manual refresh requested');
    this.loadDevices();
    this.addNotification('Data refreshed', 'success');
  }

  logout(): void {
    console.log('🚪 Logging out...');
    
    this.devices.forEach(device => {
      this.socketService.unsubscribeFromDevice(device.device_uuid);
    });
    
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  formatTime(date: string | Date | undefined): string {
    if (!date) return 'Never';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  getStatusIcon(status: string): string {
    switch(status) {
      case 'online': return 'bi-wifi';
      case 'offline': return 'bi-wifi-off';
      default: return 'bi-question-circle';
    }
  }

  getStatusClass(status: string): string {
    switch(status) {
      case 'online': return 'status-online';
      case 'offline': return 'status-offline';
      default: return 'status-unknown';
    }
  }

  getNotificationIcon(type: string): string {
    switch(type) {
      case 'info': return 'bi-info-circle-fill text-info';
      case 'warning': return 'bi-exclamation-triangle-fill text-warning';
      case 'error': return 'bi-x-circle-fill text-danger';
      case 'success': return 'bi-check-circle-fill text-success';
      default: return 'bi-bell-fill';
    }
  }

  changeMapType(type: string): void {
    this.currentMapType = type;
    console.log('🗺️ Map type changed to:', type);
  }
  
  onMapTypeChange(type: string): void {
    this.currentMapType = type;
  }
}