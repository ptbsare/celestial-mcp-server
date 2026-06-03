import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import { OBSERVER_CONFIG } from '../config.js';
import { getEquatorialCoordinates, getObjectDetails, convertToAltAz } from '../utils/astronomy.js';
const schema = z.object({
    objectName: z.string().describe("The name or catalog identifier of the celestial object. Examples: 'Jupiter', 'Sirius', 'M31', 'NGC 7000', 'Crab Nebula'. The tool will attempt to resolve common names."),
    latitude: z.number().optional().describe("Optional observer latitude in degrees. Defaults to configured value."),
    longitude: z.number().optional().describe("Optional observer longitude in degrees. Defaults to configured value."),
    altitude: z.number().optional().describe("Optional observer altitude in meters. Defaults to configured value."),
    temperature: z.number().optional().describe("Optional ambient temperature in Celsius. Defaults to configured value."),
    pressure: z.number().optional().describe("Optional pressure in hPa. Defaults to configured value.")
});
class CelestialDetailsTool extends MCPTool {
    name = 'getCelestialDetails';
    description = "Retrieves detailed astronomical information for a specified celestial object (e.g., planet, star, Messier object, NGC/IC object). Information includes current equatorial and horizontal (altitude/azimuth) coordinates, visibility status (above/below horizon), rise/transit/set times, and, where applicable, distance, phase illumination, and upcoming moon phases. All calculations are performed for the pre-configured observer location and the current system time. The tool automatically resolves common names (e.g., 'Andromeda Galaxy' to 'M31') and handles various catalog identifiers.";
    schema = schema;
    async execute(input) {
        try {
            const date = new Date();
            const observer = {
                latitude: input.latitude ?? OBSERVER_CONFIG.latitude,
                longitude: input.longitude ?? OBSERVER_CONFIG.longitude,
                elevation: input.altitude ?? OBSERVER_CONFIG.altitude,
                temperature: input.temperature ?? OBSERVER_CONFIG.temperature,
                pressure: input.pressure ?? OBSERVER_CONFIG.pressure
            };
            let equatorialCoords;
            try {
                equatorialCoords = await getEquatorialCoordinates(input.objectName, date);
            }
            catch (error) {
                throw new Error(`Could not find object: ${input.objectName}. ${error.message}`);
            }
            const altazCoords = convertToAltAz(equatorialCoords, observer, date);
            const details = getObjectDetails(input.objectName, date, observer);
            const locationName = `Configured (${OBSERVER_CONFIG.latitude.toFixed(4)}°, ${OBSERVER_CONFIG.longitude.toFixed(4)}°)`;
            const isAboveHorizon = altazCoords.altitude > 0;
            const visibility = isAboveHorizon
                ? altazCoords.altitude > 30
                    ? "Excellent visibility"
                    : "Above horizon"
                : "Below horizon (not visible)";
            const response = {
                object: input.objectName,
                ...(typeof equatorialCoords.magnitude === 'number' && { apparentMagnitude: equatorialCoords.magnitude }),
                ...(equatorialCoords.type && { objectType: equatorialCoords.type }),
                ...(equatorialCoords.constellation && { constellation: equatorialCoords.constellation }),
                observationTime: date.toLocaleString() + " (system local time)",
                location: locationName,
                coordinates: {
                    equatorial: {
                        rightAscension: equatorialCoords.rightAscension.toFixed(4) + "h",
                        declination: equatorialCoords.declination.toFixed(4) + "°"
                    },
                    horizontal: {
                        altitude: altazCoords.altitude.toFixed(4) + "°",
                        azimuth: altazCoords.azimuth.toFixed(4) + "°"
                    }
                },
                aboveHorizon: isAboveHorizon ? "Yes" : "No",
                visibility: visibility
            };
            if (details) {
                const formatTime = (timeObj) => {
                    if (!timeObj)
                        return "N/A";
                    const d = timeObj instanceof Date ? timeObj : new Date(timeObj.date);
                    return d.toLocaleTimeString();
                };
                let note = "";
                if (details.isCircumpolar) {
                    if (details.alwaysAboveHorizon) {
                        note = "This object is circumpolar and remains above the horizon from this location.";
                    }
                    else if (details.alwaysBelowHorizon) {
                        note = "This object is circumpolar and remains below the horizon from this location.";
                    }
                    else {
                        note = "This object is circumpolar from this location.";
                    }
                }
                else {
                    if (!details.riseTime && !details.setTime &&
                        details.transitTime && details.transitTime.hor && details.transitTime.hor.altitude < 0) {
                        note = "This object does not rise above the horizon on this date from this location.";
                    }
                }
                const riseStr = formatTime(details.riseTime);
                const transitStr = formatTime(details.transitTime ? details.transitTime.time : null);
                const setStr = formatTime(details.setTime);
                if (riseStr === "N/A" && transitStr === "N/A" && setStr === "N/A" && !note) {
                    note = "Rise, transit, and set times are not available for this object on this date at this location.";
                }
                response.visibilityTimes = {
                    rise: riseStr,
                    transit: transitStr,
                    set: setStr
                };
                if (note)
                    response.visibilityTimes.note = note;
            }
            else {
                response.visibilityTimes = {
                    note: "Astronomical details, including rise/set times, could not be determined for this object."
                };
            }
            if (details && details.distance) {
                response.distance = {
                    astronomicalUnits: details.distance.au.toFixed(6),
                    kilometers: Math.round(details.distance.km).toLocaleString()
                };
            }
            if (details && details.phaseInfo) {
                response.phase = {
                    percentIlluminated: details.phaseInfo.phasePercent.toFixed(1) + "%",
                    trend: details.phaseInfo.isWaxing ? "Waxing" : "Waning"
                };
            }
            if (details && details.moonPhases && input.objectName.toLowerCase() === 'moon') {
                response.upcomingPhases = {
                    newMoon: new Date(details.moonPhases.nextNewMoon.date).toLocaleDateString(),
                    firstQuarter: new Date(details.moonPhases.nextFirstQuarter.date).toLocaleDateString(),
                    fullMoon: new Date(details.moonPhases.nextFullMoon.date).toLocaleDateString(),
                    lastQuarter: new Date(details.moonPhases.nextLastQuarter.date).toLocaleDateString()
                };
            }
            return response;
        }
        catch (error) {
            throw new Error(`Failed to get celestial details: ${error.message}`);
        }
    }
}
export default CelestialDetailsTool;
