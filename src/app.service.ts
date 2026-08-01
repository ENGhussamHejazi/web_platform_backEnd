import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  health() {
    return {
      status: 'ok',
      service: 'souq-syria-api',
      time: new Date().toISOString(),
    };
  }
}
