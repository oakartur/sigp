import { Test, TestingModule } from '@nestjs/testing';
import { FormulasController } from './formulas.controller';

describe('FormulasController', () => {
  let controller: FormulasController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormulasController],
    }).compile();

    controller = module.get<FormulasController>(FormulasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
