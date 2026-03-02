const reveals = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
	(entries) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.classList.add('is-visible');
				revealObserver.unobserve(entry.target);
			}
		});
	},
	{ threshold: 0.2 }
);

reveals.forEach((el) => revealObserver.observe(el));

const heroMedia = document.getElementById('heroMedia');

if (heroMedia) {
	const handleMove = (event) => {
		const rect = heroMedia.getBoundingClientRect();
		const x = (event.clientX - rect.left) / rect.width - 0.5;
		const y = (event.clientY - rect.top) / rect.height - 0.5;
		heroMedia.style.transform = `rotateX(${y * -4}deg) rotateY(${x * 6}deg)`;
	};

	const reset = () => {
		heroMedia.style.transform = 'rotateX(0deg) rotateY(0deg)';
	};

	heroMedia.addEventListener('mousemove', handleMove);
	heroMedia.addEventListener('mouseleave', reset);
}
