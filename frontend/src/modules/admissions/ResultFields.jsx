import { emptyResult, percentageOf } from './admissionsUtils';

export default function ResultFields({ rows, rules, onChange, showBoardRoll = false }) {
  if (!rules.length) {
    return (
      <div className="admission-result-empty">
        No previous-result fields are required for this Class / Program.
      </div>
    );
  }

  return (
    <div className="admission-results-table admission-modal-wide">
      <div className="admission-results-head">
        <div className="admission-result-level-head">Result</div>
        <div>Board Roll No.</div>
        <div>Obtained Marks</div>
        <div>Total Marks</div>
        <div>Percentage</div>
      </div>

      {rules.map((rule, index) => {
        const row = rows[index] || emptyResult(rule.level);
        const pct = percentageOf(row);
        const showRoll = showBoardRoll || rule.boardRollRequired;

        return (
          <div className="admission-results-row" key={rule.level}>
            <div className="admission-result-level">
              <strong>{rule.level} Result</strong>
            </div>

            <div className="admission-result-cell">
              <span className="admission-result-mobile-label">Board Roll No.</span>
              {showRoll ? (
                <input
                  value={row.boardRollNo || ''}
                  onChange={e => onChange(index, 'boardRollNo', e.target.value)}
                />
              ) : (
                <div className="admission-result-na">—</div>
              )}
            </div>

            <div className="admission-result-cell">
              <span className="admission-result-mobile-label">Obtained Marks</span>
              <input
                type="number"
                min="0"
                value={row.obtainedMarks ?? ''}
                onChange={e => onChange(index, 'obtainedMarks', e.target.value)}
              />
            </div>

            <div className="admission-result-cell">
              <span className="admission-result-mobile-label">Total Marks</span>
              <input
                type="number"
                min="1"
                value={row.totalMarks ?? ''}
                onChange={e => onChange(index, 'totalMarks', e.target.value)}
              />
            </div>

            <div className="admission-result-cell">
              <span className="admission-result-mobile-label">Percentage</span>
              <input disabled value={pct ? `${pct}%` : ''} placeholder="Auto" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
