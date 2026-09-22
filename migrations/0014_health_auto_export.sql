-- Health Auto Export is a device-export source for canonical daily Activity.
-- Apple Health remains the source for sleep intervals and workout summaries.

INSERT INTO data_sources (key, display_name, source_kind)
VALUES ('health_auto_export', 'Health Auto Export', 'device_export')
ON CONFLICT (key) DO NOTHING;
