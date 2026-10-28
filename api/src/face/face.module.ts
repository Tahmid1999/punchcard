import { Module } from '@nestjs/common';

import { FaceClient } from './face.client';
import { FaceService } from './face.service';

@Module({ providers: [FaceClient, FaceService], exports: [FaceService] })
export class FaceModule {}
