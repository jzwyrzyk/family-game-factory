const assert = require('node:assert/strict');

exports.assertQuestionEntry = async activity => {
  const entry = await activity.locator('.workspace-question').evaluate(heading => {
    const rect = heading.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const activity = heading.closest('.learning-workspace');
    const firstReadingContent = activity.querySelector('.workspace-stimulus > *') || activity.querySelector('.workspace-work');
    const reading = firstReadingContent?.getBoundingClientRect();
    return {
      readingInView: !activity.classList.contains('language-activity') || (reading?.height > 0 && reading.top < innerHeight - 20 && reading.bottom > 0),
      focused: document.activeElement === heading,
      visible: rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight && heading.contains(hit),
      top: rect.top, bottom: rect.bottom, viewport: innerHeight
    };
  });
  assert.ok(entry.focused && entry.visible && entry.readingInView, 'My Powers opens with the question focused and visible: ' + JSON.stringify(entry));
};
