import fs from 'node:fs';
import type { Express, Request, Response } from 'express';
import { deleteCallRecord, readAllCalls, resolveSafeAudioPath, updateCallRecord } from '../store';
import { resolveAudioMimeType } from '../config';
import { extractErrorDetails } from '../errors';

/** Persisted call library CRUD plus Range-enabled audio streaming. */
export function registerCallRoutes(app: Express): void {
  app.get('/api/calls', async (_req: Request, res: Response) => {
    try {
      const calls = await readAllCalls();
      res.json({ calls });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.patch('/api/calls/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as {
        title?: string;
        accountName?: string;
        speakerARole?: string;
        speakerBRole?: string;
        nextStepCompleted?: boolean;
        toggleBookmarkTurnId?: string;
        coachNoteUpdate?: { turnId: string; note: string };
      };

      const updated = await updateCallRecord(id, (current) => {
        let nextTranscript = current.transcript;
        const nextSpeakerARole =
          typeof body.speakerARole === 'string' && body.speakerARole.trim()
            ? body.speakerARole.trim()
            : current.speakerARole;
        const nextSpeakerBRole =
          typeof body.speakerBRole === 'string' && body.speakerBRole.trim()
            ? body.speakerBRole.trim()
            : current.speakerBRole;

        if (
          nextSpeakerARole !== current.speakerARole ||
          nextSpeakerBRole !== current.speakerBRole
        ) {
          nextTranscript = nextTranscript.map((seg) => ({
            ...seg,
            speakerLabel: seg.speaker === 'Speaker A' ? nextSpeakerARole : nextSpeakerBRole,
          }));
        }

        if (body.toggleBookmarkTurnId) {
          nextTranscript = nextTranscript.map((seg) =>
            seg.id === body.toggleBookmarkTurnId ? { ...seg, bookmarked: !seg.bookmarked } : seg
          );
        }

        if (body.coachNoteUpdate && body.coachNoteUpdate.turnId) {
          const cleanNote = body.coachNoteUpdate.note.trim();
          nextTranscript = nextTranscript.map((seg) =>
            seg.id === body.coachNoteUpdate!.turnId
              ? { ...seg, coachNote: cleanNote || undefined }
              : seg
          );
        }

        return {
          ...current,
          title:
            typeof body.title === 'string' && body.title.trim() ? body.title.trim() : current.title,
          accountName:
            typeof body.accountName === 'string' && body.accountName.trim()
              ? body.accountName.trim()
              : current.accountName,
          speakerARole: nextSpeakerARole,
          speakerBRole: nextSpeakerBRole,
          transcript: nextTranscript,
          coaching:
            typeof body.nextStepCompleted === 'boolean'
              ? { ...current.coaching, nextStepCompleted: body.nextStepCompleted }
              : current.coaching,
        };
      });

      if (!updated) {
        res.status(404).json({ error: 'Call record not found.' });
        return;
      }

      res.json({ call: updated });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.delete('/api/calls/:id', async (req: Request, res: Response) => {
    try {
      const calls = await deleteCallRecord(req.params.id);
      res.json({ calls });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // Stream uploaded audio with HTTP Range support
  app.get('/api/audio/:filename', (req: Request, res: Response) => {
    const filePath = resolveSafeAudioPath(req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Audio file not found.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const mimeType = resolveAudioMimeType(undefined, filePath);
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (!match) {
        res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(stat.size - 1, parseInt(match[2], 10)) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}
