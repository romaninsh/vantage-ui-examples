# Riverside General Hospital — an icon rail

A small Vantage app that shows off the **icon rail** layout. All the data comes from the `faker`
datasource, so there is nothing to install or connect.

## What to look at

- **One icon per section.** `layout/rail.yaml` shows `menu/left.yaml` as `nav: rail`. Each
  section's `icon:` is its icon in the rail; hover it for the name.
- **Pages beside the rail.** Click Patients or Wards: their pages are listed in the column next
  to the rail. The page on screen is highlighted.
- **Straight to the page.** Home, Staff, Appointments and About each hold one page, so their
  icons open the page at once.
- **A live badge.** The badge on Patients counts patients arriving at the ER front desk right
  now.
- **Live edits keep your place.** Change `width: 220` in `layout/rail.yaml` and save: the rail
  keeps the section you chose.

## Pages

- **Home**: live counts of patients, admissions and appointments, plus the ER arrivals feed.
- **Patients**: the patient roster. Open one to see their admissions and appointments.
- **Admissions**: every admission, its ward and its diagnosis.
- **Wards**: wards and their bed occupancy; pick a ward to see its beds.
- **Beds**: every bed, across every ward.
- **Staff**: doctors and nurses, their department and shift.
- **Appointments**: upcoming appointments over the next two weeks, by clinic and status.
- **About**: this file.
