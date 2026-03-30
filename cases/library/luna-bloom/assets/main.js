const reveals = document.querySelectorAll('.reveal');
const counters = document.querySelectorAll('[data-counter]');

const revealObserver = new IntersectionObserver(
	(entries, observer) => {
		entries.forEach((entry) => {
			if (!entry.isIntersecting) return;
			entry.target.classList.add('is-visible');
			observer.unobserve(entry.target);
		});
	},
	{ threshold: 0.2 }
);

reveals.forEach((item) => revealObserver.observe(item));

const animateCounter = (el) => {
	const raw = el.dataset.counter || '0';
	const target = Number(raw);
	const hasDecimal = raw.includes('.');
	let current = 0;
	const total = 1200;
	const step = 16;
	const increment = target / (total / step);
	const timer = setInterval(() => {
		current += increment;
		if (current >= target) {
			el.textContent = hasDecimal ? target.toFixed(1) : Math.round(target).toString();
			clearInterval(timer);
			return;
		}
		el.textContent = hasDecimal ? current.toFixed(1) : Math.round(current).toString();
	}, step);
};

const counterObserver = new IntersectionObserver(
	(entries, observer) => {
		entries.forEach((entry) => {
			if (!entry.isIntersecting) return;
			animateCounter(entry.target);
			observer.unobserve(entry.target);
		});
	},
	{ threshold: 0.4 }
);

counters.forEach((counter) => counterObserver.observe(counter));
