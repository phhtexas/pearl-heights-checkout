-- 0009 (ChatGPT note 97): one scheduled payment per booking, so its terminal audit events happen at most once.
CREATE UNIQUE INDEX IF NOT EXISTS audit_second_payment_once ON audit_log (booking_id, action)
  WHERE action IN ('second_payment_paid', 'second_payment_failed_final', 'second_payment_manual_review');
