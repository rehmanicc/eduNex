const WING_TYPES = Object.freeze([
  { value: 'junior', label: 'Junior Section', description: 'Playgroup to Class 5' },
  { value: 'middle', label: 'Middle Section', description: 'Class 6 to Class 8' },
  { value: 'high', label: 'High Section', description: 'Class 9 to Class 10' },
  { value: 'intermediate', label: 'Intermediate', description: 'College / Class 11 to 12' },
  { value: 'university', label: 'University', description: 'Degree programs' },
  { value: 'cambridge', label: 'Cambridge', description: 'Primary, O-Level and A-Level' }
]);
const WING_VALUES = WING_TYPES.map(x => x.value);
const isWingType = value => WING_VALUES.includes(String(value || '').toLowerCase());
module.exports = { WING_TYPES, WING_VALUES, isWingType };
