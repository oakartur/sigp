import { Test, TestingModule } from '@nestjs/testing';
import { RequisitionsService } from './requisitions.service';

describe('RequisitionsService', () => {
  let service: RequisitionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequisitionsService],
    }).compile();

    service = module.get<RequisitionsService>(RequisitionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
