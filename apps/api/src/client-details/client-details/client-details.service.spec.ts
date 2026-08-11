import { Test, TestingModule } from '@nestjs/testing';
import { ClientDetailsService } from './client-details.service';

describe('ClientDetailsService', () => {
  let service: ClientDetailsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientDetailsService],
    }).compile();

    service = module.get<ClientDetailsService>(ClientDetailsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
