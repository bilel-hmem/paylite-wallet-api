import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface ReconcileMismatch {
  walletId: number;
  balance: number;
  ledgerBalance: number;
}

export interface ReconcileReport {
  consistent: boolean;
  walletsChecked: number;
  mismatches: ReconcileMismatch[];
  checkedAt: Date;
}

@Injectable()
export class AdminService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Recomputes every balance from the ledger (credits - debits) and compares it
   * with the stored balance. Any mismatch means money was created or lost.
   */
  async reconcile(): Promise<ReconcileReport> {
    const rows = await this.dataSource.query<
      { walletId: number | string; balance: number | string; ledgerBalance: number | string }[]
    >(`
      SELECT w.id AS walletId,
             w.balance AS balance,
             COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)
               AS ledgerBalance
      FROM wallets w
      LEFT JOIN ledger_entries e ON e.wallet_id = w.id
      GROUP BY w.id, w.balance
    `);

    const mismatches = rows
      .map((row) => ({
        walletId: Number(row.walletId),
        balance: Number(row.balance),
        ledgerBalance: Number(row.ledgerBalance),
      }))
      .filter((row) => row.balance !== row.ledgerBalance);

    return {
      consistent: mismatches.length === 0,
      walletsChecked: rows.length,
      mismatches,
      checkedAt: new Date(),
    };
  }
}
