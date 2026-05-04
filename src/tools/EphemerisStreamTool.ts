import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import { OBSERVER_CONFIG } from '../config.js';
import { getEquatorialCoordinates, convertToAltAz, EquatorialCoordinates } from '../utils/astronomy.js';

const schema = z.object({
  objects: z.array(z.string()).describe('List of object names or catalog identifiers to track.'),
  cadenceMinutes: z.number().positive().optional().describe('Sampling cadence in minutes. Default: 5.'),
  durationMinutes: z.number().positive().optional().describe('Total duration in minutes to generate samples for. Default: 60.'),
  latitude: z.number().optional().describe('Observer latitude in degrees. Optional.'),
  longitude: z.number().optional().describe('Observer longitude in degrees. Optional.'),
  altitude: z.number().optional().describe('Observer altitude in meters. Optional.'),
  temperature: z.number().optional().describe('Ambient temperature in Celsius. Optional.'),
  pressure: z.number().optional().describe('Pressure in hPa. Optional.'),
  minAltitude: z.number().optional().describe('Minimum altitude filter in degrees. Default: 0.'),
  startTime: z.string().optional().describe('ISO start time for the stream. Defaults to now.')
});

class EphemerisStreamTool extends MCPTool {
  name = 'getEphemerisStream';
  description = 'Generates a time series of altitude/azimuth for selected objects over a period at a fixed cadence. Useful for live tracking or periodic polling.';
  schema = schema;

  async execute(input: z.infer<typeof schema>) {
    const cadence = input.cadenceMinutes ?? 5;
    const duration = input.durationMinutes ?? 60;
    const minAlt = input.minAltitude ?? 0;
    const start = input.startTime ? new Date(input.startTime) : new Date();
    const observer = {
      latitude: input.latitude ?? OBSERVER_CONFIG.latitude,
      longitude: input.longitude ?? OBSERVER_CONFIG.longitude,
      elevation: input.altitude ?? OBSERVER_CONFIG.altitude,
      temperature: input.temperature ?? OBSERVER_CONFIG.temperature,
      pressure: input.pressure ?? OBSERVER_CONFIG.pressure
    };

    const frames: any[] = [];

    for (let m = 0; m <= duration; m += cadence) {
      const t = new Date(start.getTime() + m * 60000);
      for (const name of input.objects) {
        let eq: EquatorialCoordinates;
        try {
          eq = await getEquatorialCoordinates(name, t);
        } catch (e: any) {
          continue;
        }
        const hor = convertToAltAz(eq, observer, t);
        if (hor.altitude < minAlt) continue;
        frames.push({
          object: name,
          time: t.toISOString(),
          altitude: parseFloat(hor.altitude.toFixed(2)),
          azimuth: parseFloat(hor.azimuth.toFixed(2)),
          aboveHorizon: hor.altitude > 0,
          ...(typeof eq.magnitude === 'number' && { apparentMagnitude: eq.magnitude }),
          ...(eq.constellation && { constellation: eq.constellation }),
          ...(eq.type && { objectType: eq.type })
        });
      }
    }

    frames.sort((a, b) => a.time.localeCompare(b.time) || a.object.localeCompare(b.object));

    return {
      observer: {
        latitude: observer.latitude,
        longitude: observer.longitude,
        altitude: observer.elevation
      },
      cadenceMinutes: cadence,
      durationMinutes: duration,
      suggestedPollIntervalSeconds: cadence * 60,
      samples: frames
    };
  }
}

export default EphemerisStreamTool;
