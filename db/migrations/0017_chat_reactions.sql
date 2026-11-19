-- 0017 (Oscar, Nov 19): emoji reactions on chat messages, Airbnb's five only (like, love, laugh, clap, smile).
-- One reaction per side per message (guest and host), on any message in the thread, as in the Airbnb app.
ALTER TABLE stay_chat_messages ADD COLUMN IF NOT EXISTS guest_reaction text CHECK (guest_reaction IN ('😊', '❤️', '👍', '👏', '🤣'));
ALTER TABLE stay_chat_messages ADD COLUMN IF NOT EXISTS host_reaction text CHECK (host_reaction IN ('😊', '❤️', '👍', '👏', '🤣'));
