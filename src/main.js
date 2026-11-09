// Keep the footer year current.
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

// Old arcade deep links (#/projects, #/fantasy-football-ai, ...) land on the matching section.
const legacy = {
  '#/about': '#about',
  '#/projects': '#projects',
  '#/fantasy-football-ai': '#projects',
  '#/fpl-ai': '#projects',
  '#/bajazzo': '#projects',
  '#/contact': '#contact',
};
const target = legacy[location.hash];
if (target) {
  history.replaceState(null, '', target);
  document.querySelector(target)?.scrollIntoView();
}
