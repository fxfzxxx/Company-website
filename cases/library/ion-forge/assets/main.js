const reveals = document.querySelectorAll('.reveal');
const counters = document.querySelectorAll('[data-counter]');
const heroVisual = document.getElementById('heroVisual');
const materialVisual = document.getElementById('materialVisual');
const tiltCards = document.querySelectorAll('[data-tilt]');

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
	const total = 1000;
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

const handleParallax = (event, target, intensity) => {
	if (!target) return;
	const rect = target.getBoundingClientRect();
	const x = (event.clientX - rect.left) / rect.width - 0.5;
	const y = (event.clientY - rect.top) / rect.height - 0.5;
	target.style.transform = `rotateX(${y * -intensity}deg) rotateY(${x * intensity}deg)`;
};

const resetParallax = (target) => {
	if (!target) return;
	target.style.transform = 'rotateX(0deg) rotateY(0deg)';
};

if (heroVisual) {
	heroVisual.addEventListener('mousemove', (event) => handleParallax(event, heroVisual, 10));
	heroVisual.addEventListener('mouseleave', () => resetParallax(heroVisual));
}

if (materialVisual) {
	materialVisual.addEventListener('mousemove', (event) => handleParallax(event, materialVisual, 8));
	materialVisual.addEventListener('mouseleave', () => resetParallax(materialVisual));
}

tiltCards.forEach((card) => {
	card.addEventListener('mousemove', (event) => {
		const rect = card.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width - 0.5;
		const y = (event.clientY - rect.top) / rect.height - 0.5;
		card.style.transform = `translateY(-6px) rotateX(${y * -6}deg) rotateY(${x * 8}deg)`;
	});

	card.addEventListener('mouseleave', () => {
		card.style.transform = 'translateY(0) rotateX(0deg) rotateY(0deg)';
	});
});
