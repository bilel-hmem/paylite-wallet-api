import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    json = jest.fn();
    const status = jest.fn(() => ({ json }));
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'POST', url: '/api/v1/transfers' }),
      }),
    } as unknown as ArgumentsHost;
  });

  it('keeps the status and message of HTTP exceptions', () => {
    filter.catch(new NotFoundException('Recipient not found'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        message: 'Recipient not found',
        path: '/api/v1/transfers',
      }),
    );
  });

  it('passes validation messages through as a list', () => {
    filter.catch(new BadRequestException(['amount must be an integer number']), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, message: ['amount must be an integer number'] }),
    );
  });

  it('maps a MySQL duplicate key error to 409 Conflict', () => {
    const error = new QueryFailedError(
      'INSERT ...',
      [],
      Object.assign(new Error('dup'), {
        code: 'ER_DUP_ENTRY',
      }),
    );

    filter.catch(error, host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'Resource already exists' }),
    );
  });

  it('hides the details of unexpected errors', () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    filter.catch(new Error('connection string leaked here'), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' }),
    );
    logSpy.mockRestore();
  });
});
