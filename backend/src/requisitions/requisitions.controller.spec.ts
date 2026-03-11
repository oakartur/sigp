import { Test, TestingModule } from '@nestjs/testing';
import { RequisitionsController } from './requisitions.controller';

describe('RequisitionsController', () => {
  let controller: RequisitionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequisitionsController],
    }).compile();

    controller = module.get<RequisitionsController>(RequisitionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
