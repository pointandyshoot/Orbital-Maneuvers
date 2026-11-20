# Orbital Command

A shared-clock browser strategy game for one to four players. Guide a space programme from 1975 through a speculative future. The campaign ends in January 2060 after roughly 102 minutes at continuous 4× speed.

## Host a campaign

Requires Node.js 22 or newer. The game has no runtime package dependencies.

```sh
node server.mjs
```

The default address is `http://127.0.0.1:8787`. For a trusted LAN or private VPN, bind the service to an address your friends can reach.

```sh
HOST=0.0.0.0 PORT=8787 node server.mjs
```

Allow inbound TCP 8787 on the intended private network if the host firewall blocks it. For internet play, use a private overlay network or put an HTTPS reverse proxy in front of the local listener. With a public HTTPS proxy, direct port forwarding for the Node service is unnecessary. Share a link using the same hostname your friends can reach.

The host creates a room, chooses the expected number of humans, and shares the invite. The campaign starts automatically when those players have picked distinct factions and marked themselves ready. Select one human for solo play. The remaining factions are AI-controlled. Everyone initially requests 4×. The lowest speed requested by a connected player becomes the shared speed, including pause. The campaign pauses when every player leaves and resumes when someone returns. Using the same browser profile and origin restores the seat. The server stores a hash of its private credential.

The server saves each room and its pending game orders under `data/`, or under the directory specified by `DATA_DIR`. Keep this directory when upgrading or restarting. For development, `MONTH_MS` changes the wall-clock milliseconds per simulated month at 4×. The default is 6000.

## Play

- **Command** shows ground tracks, approximate instantaneous coverage, fleet condition, orbital hazards and global tension. Select a spacecraft to estimate transfers or adjust its orbital spacing.
- **Spacecraft** assembles a reusable class from researched buses and modules. Drag equipment onto the blueprint slots or click the module after selecting a slot. Extra power, heat rejection, propellant and launch capacity compete for mass.
- **Production & launch** handles manufacture, stock, launch queues and standing replenishment orders. Different orbits suit different services. Maintain backups before the initial fleet reaches retirement.
- **Research** has 45 technologies across six branches, with cross-branch prerequisites and catch-up for projects demonstrated elsewhere. **Economy** controls programme funding, the ground network and debris remediation.
- **Intelligence & events** exposes estimates rather than rival build details. Incidents provide opportunities to negotiate, deliver services, gather intelligence, or act against designated fictional crisis assets.
- **Final assessment** rewards military readiness, conflict contribution, intelligence, operations, resilience and stewardship. Civilian adoption gradually increases GDP and future budgets. During proxy crises the server rolls for escalation each month. Aggression raises risk while defensive capacity, redundancy and negotiations lower it. The aftermath can close some orbits to new launches for years.

## Simulation and sources

Historical events include Apollo–Soyuz, Helsinki, Afghanistan, Challenger, the Gulf crisis and ISS assembly. Soviet succession depends on fiscal and orbital-service strength. The later disputes and the prospect of a general war are speculative game events. Credits and GDP effects are tuning values. Circular orbital presets use analytic motion, approximate transfers and statistical debris exposure. Coverage is a line-of-sight illustration. The service model also includes capacity, redundancy and ground support.

- [NASA Apollo–Soyuz](https://www.nasa.gov/missions/apollo-soyuz/the-apollo-soyuz-mission/)
- [Office of the Historian on détente](https://history.state.gov/milestones/1969-1976/detente), [Afghanistan](https://history.state.gov/milestones/1977-1980/soviet-invasion-afghanistan) and [Soviet succession](https://history.state.gov/milestones/1989-1992/collapse-soviet-union)
- [NASA space history timeline](https://www.nasa.gov/specials/timeline/topics.html)
- [NASA orbital elements](https://science.nasa.gov/learn/basics-of-space-flight/chapter5-1/) and [ESA debris models](https://www.sdo.esoc.esa.int/)
- [Natural Earth 1:110m coastlines](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-coastline/), distributed as [public-domain data](https://www.naturalearthdata.com/about/terms-of-use/)

The design is Earth-focused. A later Moon expansion could introduce a competing use for launch capacity through relay coverage, science, and logistics for sustained surface operations. Its economic importance would depend on actual demand, transport cost and how much infrastructure each faction can keep operating.

## Military demand and design assumptions

The four commands compete for finite tasking capacity. The command screen shows the resulting readiness, and each proxy incident names its priority customer. Conflict assessments average support over the incident. A shortfall reduces economic capacity while the campaign continues. Existing saves retain previously earned points.

Observation uses relative instrument detail, cloud, duty cycle, onboard image selection and a spacing-based revisit proxy. The diminishing-return curves and command weights are balancing assumptions. Deep-ocean charting represents indirect inference from surface altimetry. Hardware changes require new builds. The late-game tandem blanket and wide deployment of resilient onboard routing are speculative.

- [NOAA on indirect ocean mapping](https://oceanservice.noaa.gov/facts/satellites-ocean.html)
- [NASA SWOT handbook on radar and optical measurements](https://earthdata.nasa.gov/s3fs-public/2024-06/D-109532_SWOT_UserHandbook_20240502.pdf)
- [GPS economic benefits study](https://www.gps.gov/sites/default/files/2025-07/gps_finalreport618.pdf)
- [ESA onboard image selection](https://philab.esa.int/flagship-programmes/phi-sats-programme/) and [research into optical network resilience](https://resilience.esa.int/archives/projects/ot4ngsat)
- [Historical Soviet reactor-powered radar spacecraft](https://www.archives.gov/files/declassification/iscap/pdf/2012-151-doc01-03.pdf)

## Test

```sh
node --test
```

The suite covers research prerequisites, class constraints, production and replenishment, orbit and debris behaviour, faction-scoped information, historical divergence, war and recovery, deterministic saves, and the multiplayer lobby and clock.
