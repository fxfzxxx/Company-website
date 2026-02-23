const counters = document.querySelectorAll('[data-counter]');
const revealItems = document.querySelectorAll('.reveal');
const hero = document.querySelector('[data-parallax]');
const slider = document.querySelector('#quote-slider');

function animateCounter(el) {
	const raw = el.dataset.counter;
	const target = Number(raw);
	const hasDecimal = raw.includes('.');
	let start = 0;
	const total = 1000;
	const step = 16;
	const increment = target / (total / step);
	const timer = setInterval(() => {
		start += increment;
		if (start >= target) {
			el.textContent = hasDecimal ? target.toFixed(1) : Math.round(target).toString();
			clearInterval(timer);
			return;
		}
		el.textContent = hasDecimal ? start.toFixed(1) : Math.round(start).toString();
	}, step);
}

const counterObserver = new IntersectionObserver((entries, observer) => {
	entries.forEach((entry) => {
		if (!entry.isIntersecting) {
			return;
		}
		animateCounter(entry.target);
		observer.unobserve(entry.target);
	});
}, { threshold: 0.45 });

counters.forEach((counter) => counterObserver.observe(counter));

const revealObserver = new IntersectionObserver((entries) => {
	entries.forEach((entry) => {
		if (entry.isIntersecting) {
			entry.target.classList.add('is-visible');
		}
	});
}, { threshold: 0.2 });

revealItems.forEach((item) => revealObserver.observe(item));

if (hero) {
	window.addEventListener('mousemove', (event) => {
		const x = (event.clientX / window.innerWidth) * 100;
		const y = (event.clientY / window.innerHeight) * 100;
		hero.style.setProperty('--mx', `${x}%`);
		hero.style.setProperty('--my', `${y}%`);
	});
}

const cards = document.querySelectorAll('[data-tilt]');
cards.forEach((card) => {
	card.addEventListener('mousemove', (event) => {
		const rect = card.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		const rotateY = ((x / rect.width) - 0.5) * 10;
		const rotateX = ((y / rect.height) - 0.5) * -10;
		card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
	});

	card.addEventListener('mouseleave', () => {
		card.style.transform = 'rotateX(0deg) rotateY(0deg) translateY(0px)';
	});
});

if (slider) {
	const slides = Array.from(slider.querySelectorAll('.quote'));
	const dots = Array.from(slider.querySelectorAll('.dot'));
	let activeIndex = 0;
	let autoTimer;

	const setSlide = (index) => {
		slides.forEach((slide, idx) => {
			slide.classList.toggle('is-active', idx === index);
		});
		dots.forEach((dot, idx) => {
			dot.classList.toggle('is-active', idx === index);
		});
		activeIndex = index;
	};

	const startAuto = () => {
		autoTimer = setInterval(() => {
			const next = (activeIndex + 1) % slides.length;
			setSlide(next);
		}, 4500);
	};

	dots.forEach((dot, index) => {
		dot.addEventListener('click', () => {
			setSlide(index);
			clearInterval(autoTimer);
			startAuto();
		});
	});

	startAuto();
}
