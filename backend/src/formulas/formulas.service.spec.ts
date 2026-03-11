import { Test, TestingModule } from '@nestjs/testing';
import { FormulasService } from './formulas.service';

describe('FormulasService', () => {
  let service: FormulasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FormulasService],
    }).compile();

    service = module.get<FormulasService>(FormulasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
