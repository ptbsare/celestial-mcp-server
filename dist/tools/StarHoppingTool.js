import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import { OBSERVER_CONFIG } from '../config.js';
import { getEquatorialCoordinates, convertToAltAz, STAR_CATALOG, calculateAngularSeparation, calculateBearing, } from '../utils/astronomy.js';
const schema = z.object({
    targetObjectName: z.string().describe('The name or catalog identifier of the celestial object to find (e.g., "M13", "Andromeda Galaxy", "Mars").'),
    fovDegrees: z.number().positive().describe("The Field of View (FOV) of the user's equipment in degrees."),
    maxHopMagnitude: z.number().optional().describe('The maximum (dimmest) stellar magnitude for stars in the hopping path. Default: 8.0.'),
    initialSearchRadiusDegrees: z.number().positive().optional().describe('The angular radius around the target object to search for a suitable bright starting star. Default: 20.0 degrees.'),
    startStarMagnitudeThreshold: z.number().optional().describe('The maximum (dimmest) magnitude for a star to be a good, bright "starting star." Default: 3.5.'),
    maxHops: z.number().positive().optional().describe('Maximum number of hops to attempt before stopping. Default: 20.'),
    preferSameConstellation: z.boolean().optional().describe('Prefer stars in the same constellation as the target when available.')
});
class StarHoppingTool extends MCPTool {
    name = 'getStarHoppingPath';
    description = 'Calculates a star hopping path from a bright start star to a target celestial object. Each hop is within the specified Field of View (FOV).';
    schema = schema;
    formatCoordsForOutput(coords) {
        return {
            rightAscension: `${coords.rightAscension.toFixed(2)}h`,
            declination: `${coords.declination.toFixed(2)}°`,
        };
    }
    formatAltAzForOutput(altAz) {
        return {
            altitude: `${altAz.altitude.toFixed(1)}°`,
            azimuth: `${altAz.azimuth.toFixed(1)}°`,
        };
    }
    async execute(input) {
        const date = new Date();
        const observer = {
            latitude: OBSERVER_CONFIG.latitude,
            longitude: OBSERVER_CONFIG.longitude,
            elevation: OBSERVER_CONFIG.altitude,
            temperature: OBSERVER_CONFIG.temperature,
            pressure: OBSERVER_CONFIG.pressure,
        };
        let targetEquatorial;
        try {
            targetEquatorial = await getEquatorialCoordinates(input.targetObjectName, date);
        }
        catch (error) {
            return {
                targetObjectName: input.targetObjectName,
                status: 'TargetNotFound',
                summaryMessage: `Target object "${input.targetObjectName}" not found in catalogs. ${error.message}`,
            };
        }
        const targetAltAz = convertToAltAz(targetEquatorial, observer, date);
        if (targetAltAz.altitude <= 0) {
            return {
                targetObjectName: input.targetObjectName,
                targetCoordinates: {
                    ...this.formatCoordsForOutput(targetEquatorial),
                    ...this.formatAltAzForOutput(targetAltAz),
                },
                fieldOfViewDegrees: input.fovDegrees,
                status: 'TargetNotVisible',
                summaryMessage: `Target "${input.targetObjectName}" is currently below the horizon.`,
            };
        }
        const targetData = {
            ...targetEquatorial,
            id: input.targetObjectName.toLowerCase(),
            altAz: targetAltAz,
        };
        let potentialStartStars = [];
        const targetConstellation = targetEquatorial.constellation?.toLowerCase();
        for (const [starId, starEq] of STAR_CATALOG.entries()) {
            if (starEq.magnitude === undefined || starEq.magnitude > (input.startStarMagnitudeThreshold ?? 3.5)) {
                continue;
            }
            const separation = calculateAngularSeparation(starEq, targetEquatorial);
            if (separation > (input.initialSearchRadiusDegrees ?? 20.0)) {
                continue;
            }
            const starAltAz = convertToAltAz(starEq, observer, date);
            if (starAltAz.altitude <= 0) {
                continue;
            }
            potentialStartStars.push({ ...starEq, id: starId, altAz: starAltAz });
        }
        if (potentialStartStars.length === 0) {
            return {
                targetObjectName: input.targetObjectName,
                targetCoordinates: {
                    ...this.formatCoordsForOutput(targetEquatorial),
                    ...this.formatAltAzForOutput(targetAltAz),
                },
                fieldOfViewDegrees: input.fovDegrees,
                status: 'NoStartingStarFound',
                summaryMessage: `No suitable starting star found within ${input.initialSearchRadiusDegrees ?? 20.0}° of "${input.targetObjectName}" and brighter than magnitude ${input.startStarMagnitudeThreshold ?? 3.5}.`,
            };
        }
        potentialStartStars.sort((a, b) => {
            const sameA = input.preferSameConstellation && targetConstellation && a.constellation?.toLowerCase() === targetConstellation ? -0.5 : 0;
            const sameB = input.preferSameConstellation && targetConstellation && b.constellation?.toLowerCase() === targetConstellation ? -0.5 : 0;
            const magA = (a.magnitude ?? Infinity) + sameA;
            const magB = (b.magnitude ?? Infinity) + sameB;
            return magA - magB;
        });
        const startStar = potentialStartStars[0];
        const initialSeparationToTarget = calculateAngularSeparation(startStar, targetEquatorial);
        const baseResponse = {
            targetObjectName: input.targetObjectName,
            targetCoordinates: {
                ...this.formatCoordsForOutput(targetEquatorial),
                ...this.formatAltAzForOutput(targetAltAz),
            },
            fieldOfViewDegrees: input.fovDegrees,
            startStar: {
                name: startStar.name,
                magnitude: startStar.magnitude,
                ...this.formatCoordsForOutput(startStar),
                ...(startStar.altAz && this.formatAltAzForOutput(startStar.altAz)),
            },
        };
        if (initialSeparationToTarget <= input.fovDegrees) {
            const bearingToTarget = calculateBearing(startStar, targetEquatorial);
            return {
                ...baseResponse,
                hopSequence: [],
                finalStep: {
                    fromStar: { name: startStar.name, magnitude: startStar.magnitude },
                    message: `The target ${input.targetObjectName} should be within your FOV, approx ${initialSeparationToTarget.toFixed(1)}° towards ${bearingToTarget.cardinal} (Bearing: ${bearingToTarget.degrees}°) from ${startStar.name}.`,
                },
                status: 'TargetInStartFOV',
                summaryMessage: `Target "${input.targetObjectName}" is already within FOV of the starting star "${startStar.name}".`,
            };
        }
        const hopSequence = [];
        let currentHopStar = startStar;
        let currentDistanceToTarget = initialSeparationToTarget;
        const visitedStarIds = new Set([startStar.id]);
        const maxHops = input.maxHops ?? 20;
        for (let hopNum = 1; hopNum <= maxHops; hopNum++) {
            let bestNextHop = null;
            let smallestDistToTargetForNextHop = currentDistanceToTarget;
            for (const [candidateId, candidateEq] of STAR_CATALOG.entries()) {
                if (visitedStarIds.has(candidateId) || candidateId === targetData.id) {
                    continue;
                }
                if (candidateEq.magnitude === undefined || candidateEq.magnitude > (input.maxHopMagnitude ?? 8.0)) {
                    continue;
                }
                const hopSeparation = calculateAngularSeparation(currentHopStar, candidateEq);
                if (hopSeparation > input.fovDegrees) {
                    continue;
                }
                const candidateDistToTarget = calculateAngularSeparation(candidateEq, targetEquatorial);
                if (candidateDistToTarget >= currentDistanceToTarget) {
                    continue;
                }
                const candidateAltAz = convertToAltAz(candidateEq, observer, date);
                if (candidateAltAz.altitude <= 0) {
                    continue;
                }
                const sameConst = input.preferSameConstellation && targetConstellation && candidateEq.constellation?.toLowerCase() === targetConstellation;
                const score = candidateDistToTarget - (sameConst ? 0.1 : 0);
                const bestScore = smallestDistToTargetForNextHop - ((input.preferSameConstellation && targetConstellation && bestNextHop?.constellation?.toLowerCase() === targetConstellation) ? 0.1 : 0);
                if (!bestNextHop || score < bestScore) {
                    smallestDistToTargetForNextHop = candidateDistToTarget;
                    bestNextHop = { ...candidateEq, id: candidateId, altAz: candidateAltAz };
                }
            }
            if (bestNextHop) {
                const bearingToNextHop = calculateBearing(currentHopStar, bestNextHop);
                const hopDistance = calculateAngularSeparation(currentHopStar, bestNextHop);
                hopSequence.push({
                    hopNumber: hopNum,
                    fromStar: { name: currentHopStar.name, magnitude: currentHopStar.magnitude },
                    toStar: {
                        name: bestNextHop.name,
                        magnitude: bestNextHop.magnitude,
                        ...this.formatCoordsForOutput(bestNextHop),
                        ...(bestNextHop.altAz && this.formatAltAzForOutput(bestNextHop.altAz)),
                    },
                    direction: `towards ${bearingToNextHop.cardinal} (Bearing: ${bearingToNextHop.degrees}°)`,
                    angularDistanceDegrees: parseFloat(hopDistance.toFixed(1)),
                    ...(currentHopStar.altAz && { fromAltAz: this.formatAltAzForOutput(currentHopStar.altAz) })
                });
                currentHopStar = bestNextHop;
                currentDistanceToTarget = smallestDistToTargetForNextHop;
                visitedStarIds.add(currentHopStar.id);
                if (currentDistanceToTarget <= input.fovDegrees) {
                    const bearingToTarget = calculateBearing(currentHopStar, targetEquatorial);
                    return {
                        ...baseResponse,
                        hopSequence,
                        finalStep: {
                            fromStar: { name: currentHopStar.name, magnitude: currentHopStar.magnitude, ...(currentHopStar.altAz && this.formatAltAzForOutput(currentHopStar.altAz)) },
                            message: `The target ${input.targetObjectName} should now be within your FOV, approx ${currentDistanceToTarget.toFixed(1)}° towards ${bearingToTarget.cardinal} (Bearing: ${bearingToTarget.degrees}°) from ${currentHopStar.name}.`,
                        },
                        status: 'Success',
                        summaryMessage: `Successfully found a path with ${hopSequence.length} hop(s) to "${input.targetObjectName}".`,
                    };
                }
            }
            else {
                const bearingToTarget = calculateBearing(currentHopStar, targetEquatorial);
                return {
                    ...baseResponse,
                    hopSequence,
                    finalStep: {
                        fromStar: { name: currentHopStar.name, magnitude: currentHopStar.magnitude, ...(currentHopStar.altAz && this.formatAltAzForOutput(currentHopStar.altAz)) },
                        message: `Pathfinding stopped. Target ${input.targetObjectName} is approx ${currentDistanceToTarget.toFixed(1)}° towards ${bearingToTarget.cardinal} (Bearing: ${bearingToTarget.degrees}°) from ${currentHopStar.name}, but no further hops could be found.`,
                    },
                    status: 'PathNotFound',
                    summaryMessage: `Could not find a complete hopping path to "${input.targetObjectName}". Path generated with ${hopSequence.length} hop(s).`,
                };
            }
        }
        const bearingToTarget = calculateBearing(currentHopStar, targetEquatorial);
        return {
            ...baseResponse,
            hopSequence,
            finalStep: {
                fromStar: { name: currentHopStar.name, magnitude: currentHopStar.magnitude, ...(currentHopStar.altAz && this.formatAltAzForOutput(currentHopStar.altAz)) },
                message: `Pathfinding stopped after maximum hops. Target ${input.targetObjectName} is approx ${currentDistanceToTarget.toFixed(1)}° towards ${bearingToTarget.cardinal} (Bearing: ${bearingToTarget.degrees}°) from ${currentHopStar.name}.`,
            },
            status: 'PathNotFound',
            summaryMessage: `Path to "${input.targetObjectName}" could not be completed within the maximum hop limit. Path generated with ${hopSequence.length} hop(s).`,
        };
    }
}
export default StarHoppingTool;
