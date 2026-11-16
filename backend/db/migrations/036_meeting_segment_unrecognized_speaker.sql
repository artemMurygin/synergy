-- Реплика без метки собеседника от провайдера хранится со speaker = 0 («Нераспознан»).
-- Имена по-прежнему назначаются только собеседникам с номером от 1.
-- Откат (вручную; реплики «Нераспознан» удаляются):
--   DELETE FROM meeting_transcript_segment WHERE speaker = 0;
--   ALTER TABLE meeting_transcript_segment DROP CONSTRAINT meeting_transcript_segment_speaker_check;
--   ALTER TABLE meeting_transcript_segment ADD CONSTRAINT meeting_transcript_segment_speaker_check
--     CHECK (speaker >= 1);
--   DELETE FROM schema_migrations WHERE name = '036_meeting_segment_unrecognized_speaker.sql';
ALTER TABLE meeting_transcript_segment DROP CONSTRAINT meeting_transcript_segment_speaker_check;
ALTER TABLE meeting_transcript_segment ADD CONSTRAINT meeting_transcript_segment_speaker_check
  CHECK (speaker >= 0);
