import { Test, TestingModule } from '@nestjs/testing';
import { ClientDetailsController } from './client-details.controller';
import { ClientDetailsService } from './client-details.service';

describe('ClientDetailsController', () => {
  let controller: ClientDetailsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientDetailsController],
      providers: [ClientDetailsService],
    }).compile();

    controller = module.get<ClientDetailsController>(ClientDetailsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
