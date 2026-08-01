import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { StorageModule } from './storage/storage.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { MerchantReportsModule } from './merchant-reports/merchant-reports.module';
import { InventoryModule } from './inventory/inventory.module';
import { ShippingModule } from './shipping/shipping.module';
import { LocationsModule } from './locations/locations.module';
import { PlansModule } from './plans/plans.module';
import { StoreApplicationsModule } from './store-applications/store-applications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MailModule } from './mail/mail.module';
import { StorefrontModule } from './storefront/storefront.module';
import { StoreSettingsModule } from './store-settings/store-settings.module';
import { StoreThemeModule } from './store-theme/store-theme.module';
import { CustomerAccountModule } from './customer-account/customer-account.module';
import { CustomersModule } from './customers/customers.module';
import { MessagingModule } from './messaging/messaging.module';
import { CustomerChatModule } from './customer-chat/customer-chat.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { StoreStatusGuard } from './common/guards/store-status.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MonitoringModule } from './monitoring/monitoring.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Generous site-wide default; auth endpoints layer a much tighter
    // @Throttle() on top (see auth.controller.ts / storefront.controller.ts)
    // since brute-forcing a password is the actual risk, not browsing.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    AdminModule,
    StorageModule,
    ProductsModule,
    OrdersModule,
    MerchantReportsModule,
    InventoryModule,
    ShippingModule,
    LocationsModule,
    PlansModule,
    MailModule,
    NotificationsModule,
    MessagingModule,
    StoreApplicationsModule,
    StorefrontModule,
    StoreSettingsModule,
    StoreThemeModule,
    CustomerAccountModule,
    CustomersModule,
    SubscriptionsModule,
    CustomerChatModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: StoreStatusGuard },
  ],
})
export class AppModule {}
