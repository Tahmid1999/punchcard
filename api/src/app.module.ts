import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { CheckinModule } from './checkin/checkin.module';
import { DevicesModule } from './devices/devices.module';
import { EmployeesModule } from './employees/employees.module';
import { OfficesModule } from './offices/offices.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule, EmployeesModule, OfficesModule, DevicesModule, CheckinModule],
})
export class AppModule {}
