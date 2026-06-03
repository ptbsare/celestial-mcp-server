import { MCPTool } from 'mcp-framework';
import { z } from 'zod';
import { listCelestialObjects, STAR_CATALOG, DSO_CATALOG } from '../utils/astronomy.js';
const schema = z.object({
    category: z.string().optional().describe("Optional. Filters the list by category. Valid categories are: 'planets' (for Solar System objects like Sun, Moon, and planets), 'stars', 'messier' (for Messier objects), 'ic' (for Index Catalogue objects), 'ngc' (for New General Catalogue objects), 'dso' (for all Deep Sky Objects, including Messier, IC, NGC, and others), or 'all' (to list objects from all available categories). If omitted, defaults to 'all'."),
    limit: z.number().positive().optional().describe("Optional. Maximum number of objects to return per category."),
    offset: z.number().min(0).optional().describe("Optional. Number of objects to skip before returning results per category."),
    minMagnitude: z.number().optional().describe("Optional. Include only objects with visual magnitude less than or equal to this value. Applies to stars and DSOs."),
    constellation: z.string().optional().describe("Optional. Filter stars and DSOs by IAU constellation code or name (case-insensitive).")
});
class ListCelestialObjectsTool extends MCPTool {
    name = 'listCelestialObjects';
    description = "Lists available celestial objects that can be queried by other tools. Objects are grouped by category. You can request all objects, or filter by a specific category. This tool helps in discovering what objects are known to the system.";
    schema = schema;
    async execute(input) {
        try {
            const allCategoriesFromAstronomy = listCelestialObjects();
            const limit = typeof input.limit === 'number' && input.limit > 0 ? input.limit : undefined;
            const offset = typeof input.offset === 'number' && input.offset >= 0 ? input.offset : 0;
            const minMag = typeof input.minMagnitude === 'number' ? input.minMagnitude : undefined;
            const constellation = input.constellation ? input.constellation.trim().toLowerCase() : undefined;
            const paginate = (items) => {
                if (limit === undefined)
                    return items;
                const start = offset ?? 0;
                return items.slice(start, start + limit);
            };
            const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
            const buildStars = () => {
                const seen = new Set();
                const names = [];
                for (const [, coords] of STAR_CATALOG.entries()) {
                    if (minMag !== undefined) {
                        if (typeof coords.magnitude !== 'number' || coords.magnitude > minMag)
                            continue;
                    }
                    if (constellation) {
                        if (!coords.constellation || coords.constellation.toLowerCase() !== constellation)
                            continue;
                    }
                    const primary = coords.name ? coords.name.toLowerCase() : undefined;
                    if (!primary)
                        continue;
                    if (seen.has(primary))
                        continue;
                    seen.add(primary);
                    names.push(capitalize(primary));
                }
                names.sort();
                const page = paginate(names);
                return { total: names.length, objects: page, pageInfo: { offset: offset ?? 0, limit: limit ?? names.length } };
            };
            const buildDsoByPrefix = (prefix) => {
                const names = [];
                for (const key of DSO_CATALOG.keys()) {
                    if (prefix === 'm' && /^m\d+$/i.test(key)) {
                        const obj = DSO_CATALOG.get(key);
                        if (minMag !== undefined && (typeof obj.magnitude !== 'number' || obj.magnitude > minMag))
                            continue;
                        if (constellation && (!obj.constellation || obj.constellation.toLowerCase() !== constellation))
                            continue;
                        names.push(capitalize(key));
                    }
                    else if (prefix === 'ic' && /^ic\d+$/i.test(key)) {
                        const obj = DSO_CATALOG.get(key);
                        if (minMag !== undefined && (typeof obj.magnitude !== 'number' || obj.magnitude > minMag))
                            continue;
                        if (constellation && (!obj.constellation || obj.constellation.toLowerCase() !== constellation))
                            continue;
                        names.push(capitalize(key));
                    }
                    else if (prefix === 'ngc' && /^ngc\d+$/i.test(key)) {
                        const obj = DSO_CATALOG.get(key);
                        if (minMag !== undefined && (typeof obj.magnitude !== 'number' || obj.magnitude > minMag))
                            continue;
                        if (constellation && (!obj.constellation || obj.constellation.toLowerCase() !== constellation))
                            continue;
                        names.push(capitalize(key));
                    }
                }
                names.sort((a, b) => {
                    const pa = prefix === 'm' ? parseInt(a.substring(1)) : prefix === 'ic' ? parseInt(a.substring(2)) : parseInt(a.substring(3));
                    const pb = prefix === 'm' ? parseInt(b.substring(1)) : prefix === 'ic' ? parseInt(b.substring(2)) : parseInt(b.substring(3));
                    return pa - pb;
                });
                const page = paginate(names);
                return { total: names.length, objects: page, pageInfo: { offset: offset ?? 0, limit: limit ?? names.length } };
            };
            const buildOtherDso = () => {
                const names = [];
                for (const key of DSO_CATALOG.keys()) {
                    if (/^(m\d+|ic\d+|ngc\d+)$/i.test(key))
                        continue;
                    const obj = DSO_CATALOG.get(key);
                    if (minMag !== undefined && (typeof obj.magnitude !== 'number' || obj.magnitude > minMag))
                        continue;
                    if (constellation && (!obj.constellation || obj.constellation.toLowerCase() !== constellation))
                        continue;
                    names.push(capitalize(key));
                }
                names.sort();
                const page = paginate(names);
                return { total: names.length, objects: page, pageInfo: { offset: offset ?? 0, limit: limit ?? names.length } };
            };
            if (input.category) {
                const requestedCategoryLower = input.category.toLowerCase();
                if (requestedCategoryLower === 'all') {
                    const categoriesOut = [];
                    for (const cat of allCategoriesFromAstronomy) {
                        if (cat.category === 'Stars') {
                            const s = buildStars();
                            categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                        }
                        else if (cat.category === 'Messier Objects') {
                            const s = buildDsoByPrefix('m');
                            categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                        }
                        else if (cat.category === 'IC Objects') {
                            const s = buildDsoByPrefix('ic');
                            categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                        }
                        else if (cat.category === 'NGC Objects') {
                            const s = buildDsoByPrefix('ngc');
                            categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                        }
                        else if (cat.category === 'Other Deep Sky Objects') {
                            const s = buildOtherDso();
                            categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects });
                        }
                        else if (cat.category === 'Solar System Objects') {
                            const page = paginate(cat.objects);
                            categoriesOut.push({ category: cat.category, objectCount: page.length, objects: page, page: { offset: offset ?? 0, limit: limit ?? page.length } });
                        }
                    }
                    const totalObjects = categoriesOut.reduce((sum, c) => sum + c.objectCount, 0);
                    return { totalCategories: categoriesOut.length, totalObjects, categories: categoriesOut };
                }
                else if (requestedCategoryLower === 'dso') {
                    const parts = [
                        { name: 'Messier Objects', data: buildDsoByPrefix('m') },
                        { name: 'IC Objects', data: buildDsoByPrefix('ic') },
                        { name: 'NGC Objects', data: buildDsoByPrefix('ngc') },
                        { name: 'Other Deep Sky Objects', data: buildOtherDso() }
                    ];
                    const categories = parts.map(p => ({ category: p.name, objectCount: p.data.objects.length, objects: p.data.objects, page: p.data.pageInfo }));
                    const totalObjectsDSO = categories.reduce((sum, c) => sum + c.objectCount, 0);
                    return { totalCategories: categories.length, totalObjects: totalObjectsDSO, categories };
                }
                else {
                    const targetCategory = allCategoriesFromAstronomy.find(cat => {
                        if (requestedCategoryLower === 'planets' && cat.category === 'Solar System Objects')
                            return true;
                        if (requestedCategoryLower === 'stars' && cat.category === 'Stars')
                            return true;
                        if (requestedCategoryLower === 'messier' && cat.category === 'Messier Objects')
                            return true;
                        if (requestedCategoryLower === 'ic' && cat.category === 'IC Objects')
                            return true;
                        if (requestedCategoryLower === 'ngc' && cat.category === 'NGC Objects')
                            return true;
                        return false;
                    });
                    if (!targetCategory) {
                        const userFriendlyCategories = ['planets', 'stars', 'messier', 'ic', 'ngc', 'dso', 'all'];
                        return {
                            message: `No objects found in category "${input.category}". Available categories: ${userFriendlyCategories.join(', ')}.`,
                            availableCategories: userFriendlyCategories
                        };
                    }
                    if (requestedCategoryLower === 'stars') {
                        const s = buildStars();
                        return { category: input.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo };
                    }
                    if (requestedCategoryLower === 'messier') {
                        const s = buildDsoByPrefix('m');
                        return { category: input.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo };
                    }
                    if (requestedCategoryLower === 'ic') {
                        const s = buildDsoByPrefix('ic');
                        return { category: input.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo };
                    }
                    if (requestedCategoryLower === 'ngc') {
                        const s = buildDsoByPrefix('ngc');
                        return { category: input.category, objectCount: s.objects.length, objects: s.objects };
                    }
                    const pageItems = paginate(targetCategory.objects);
                    return { category: input.category, objectCount: pageItems.length, objects: pageItems, page: { offset: offset ?? 0, limit: limit ?? pageItems.length } };
                }
            }
            else {
                const categoriesOut = [];
                for (const cat of allCategoriesFromAstronomy) {
                    if (cat.category === 'Stars') {
                        const s = buildStars();
                        categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                    }
                    else if (cat.category === 'Messier Objects') {
                        const s = buildDsoByPrefix('m');
                        categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                    }
                    else if (cat.category === 'IC Objects') {
                        const s = buildDsoByPrefix('ic');
                        categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                    }
                    else if (cat.category === 'NGC Objects') {
                        const s = buildDsoByPrefix('ngc');
                        categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                    }
                    else if (cat.category === 'Other Deep Sky Objects') {
                        const s = buildOtherDso();
                        categoriesOut.push({ category: cat.category, objectCount: s.objects.length, objects: s.objects, page: s.pageInfo });
                    }
                    else if (cat.category === 'Solar System Objects') {
                        const pageItems = paginate(cat.objects);
                        categoriesOut.push({ category: cat.category, objectCount: pageItems.length, objects: pageItems, page: { offset: offset ?? 0, limit: limit ?? pageItems.length } });
                    }
                }
                const totalObjects = categoriesOut.reduce((sum, c) => sum + c.objectCount, 0);
                return { totalCategories: categoriesOut.length, totalObjects, categories: categoriesOut };
            }
        }
        catch (error) {
            throw new Error(`Failed to list celestial objects: ${error.message}`);
        }
    }
}
export default ListCelestialObjectsTool;
