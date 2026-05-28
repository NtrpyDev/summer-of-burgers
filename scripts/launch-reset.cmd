@echo off
setlocal
cd /d "%~dp0.."
call scripts\node-env.cmd
echo Resetting production D1 (votes, limits, Elo)...
wrangler d1 execute summer-of-burgers --file migrations\0003_launch_reset.sql --remote --yes
echo Re-seeding burgers from local archive...
node scripts\export-d1-sql.cjs
wrangler d1 execute summer-of-burgers --file data\seed-burgers.sql --remote --yes
echo Launch reset done.
