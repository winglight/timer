# Earth assets and scene conventions

The orbital observatory uses local copies of NASA imagery. No external service is
contacted when a visitor opens this scene. These historical satellite composites
are visual textures, not live Earth observations or current weather.

## Earth surface

- File: `earth-day.jpg` (4096 × 2048, RGB JPEG).
- NASA Blue Marble: Next Generation with Topography and Bathymetry, January 2004.
- Source: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x5400x2700.jpg
- Source page: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/
- Local processing: Lanczos downsampling from 5400 × 2700 to 4096 × 2048 and JPEG compression at quality 88. The map projection and geographic alignment are unchanged.
- Credit: NASA Earth Observatory / Blue Marble Next Generation; Reto Stöckli and Robert Simmon, NASA Goddard Space Flight Center. Bathymetry uses GEBCO data.

## Cloud layer

- File: `earth-clouds.jpg` (2048 × 1024, grayscale JPEG).
- Source: https://assets.science.nasa.gov/content/dam/science/esd/eo/content-feature/bluemarble/images/cloud_combined_2048.jpg
- Source page: https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/
- Local processing: converted to grayscale and JPEG compression at quality 88; original resolution retained. Brightness drives cloud opacity.
- Credit: NASA Goddard Space Flight Center. Image by Reto Stöckli; enhancements by Robert Simmon; MODIS Atmosphere Group.

## Night lights

- File: `earth-night.jpg` (2048 × 1024, grayscale JPEG).
- NASA Black Marble 2016, 0.1 degree grayscale composite.
- Source: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg
- Source page: https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- Local processing: grayscale Lanczos downsampling from 3600 × 1800 and JPEG compression at quality 88. The shader applies a warm light color only on the night side.
- Credit: NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA Goddard Space Flight Center.

NASA media usage guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
The imagery is used with attribution; the scene implies no NASA endorsement.

## Motion and viewpoint

- Solid Earth: the requested visible-motion revision uses 240 times the mean sidereal rate, completing one revolution in 86,164.0905 / 240 ≈ 359 seconds. The animation reads the wall clock every update, so scene switching and background suspension do not reset its phase. This is deliberately accelerated and is not a UT1/EOP ephemeris.
- Viewpoint: an artistic observation window at geosynchronous-orbit altitude. A literal Earth-facing geostationary station stays over the same longitude; the scene prioritizes visible planetary motion and does not simulate that orbit exactly.
- Solar direction moves on a separate 210-second cycle to make the day/night boundary visibly change while retaining an illuminated portion of Earth. Solar direction and axial tilt are illustrative; they do not predict current or seasonal illumination.
- Weather: randomized procedural ocean cyclone vignettes, seeded by time and ocean basin, with compressed growth/dissipation over several minutes. Their centers remain in predefined open-ocean regions, the shader clips simulated cloud bands to an ocean mask, and rotation reverses between hemispheres. They are not a weather forecast or a physical fluid simulation.
- Stars stay fixed; there is no atmospheric twinkling in the space view.

Scientific references:

- NASA, sidereal day: https://science.gsfc.nasa.gov/attic/cosmicopia.gsfc.nasa.gov/qa_earth.html
- NASA, orbital geometry: https://science.nasa.gov/earth/earth-observatory/catalog-of-earth-satellite-orbits/
- NOAA, cyclone structure and rotation direction: https://www.noaa.gov/jetstream/tropical/tropical-cyclone-introduction/tropical-cyclone-structure
