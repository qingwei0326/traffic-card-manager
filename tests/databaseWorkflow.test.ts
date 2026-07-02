import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('database workflow coverage location', () => {
  it('keeps SQLite workflow coverage in Rust integration tests', () => {
    const rustTests = [
      'src-tauri/tests/cards_customers.rs',
      'src-tauri/tests/plans_imports.rs',
      'src-tauri/tests/backup_finance.rs',
    ]

    for (const relative of rustTests) {
      expect(fs.existsSync(path.resolve(__dirname, '..', relative))).toBe(true)
    }
  })
})
