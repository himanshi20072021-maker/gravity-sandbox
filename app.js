const config = {
    gravityX: 0,
    gravityY: 0.5,
    bounce: 0.8,
    friction: 0.99,
    returnSpeed: 0.05
};

let elements = [];
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let lastMousePos = { x: 0, y: 0 };
let mouseVelocity = { x: 0, y: 0 };

let isVortexActive = false;
let vortexPos = { x: 0, y: 0 };
let lastVortexPos = { x: 0, y: 0 };
let isReturningHome = false;
let audioCtx = null;

function getAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    return audioCtx;
}

// Safe listener to boot context on user input without breaking logic flow
window.addEventListener('click', () => {
    try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }
    } catch (err) {
        console.log("Audio unlock deferred.");
    }
}, { once: true });

function playSynthSound(type, frequencyStart, frequencyEnd, duration) {
    try {
        const ctx = getAudioContext();
        if (!ctx || ctx.state === 'suspended') return; 

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = type; 
        osc.frequency.setValueAtTime(frequencyStart, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(frequencyEnd, ctx.currentTime + duration);

        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch (e) {
        console.log("Audio warning caught smoothly.");
    }
}

class PhysicsObject {
    constructor(domElement) {
        this.element = domElement;
        
        const rect = domElement.getBoundingClientRect();
        this.x = parseFloat(domElement.style.left) || rect.left || 0;
        this.y = parseFloat(domElement.style.top) || rect.top || 0;
        
        this.homeX = this.x;
        this.homeY = this.y;

        this.width = rect.width || domElement.offsetWidth || 100;
        this.height = rect.height || domElement.offsetHeight || 40;
        
        this.vx = 0;
        this.vy = 0;
        this.isDragged = false;
        this.isSwallowed = false;
        this.hasPlayedReturnSound = false;

        this.element.style.transition = "transform 0.15s ease, opacity 0.15s ease";
    }

    update() {
        if (this.isDragged) return;

        if (isVortexActive) {
            this.hasPlayedReturnSound = false; 

            if (!this.isSwallowed) {
                const elementCenterX = this.x + this.width / 2;
                const elementCenterY = this.y + this.height / 2;
                const dx = vortexPos.x - elementCenterX;
                const dy = vortexPos.y - elementCenterY;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;

                const pullForce = Math.min(12, 1200 / distance); 
                this.vx += (dx / distance) * pullForce;
                this.vy += (dy / distance) * pullForce;

                if (distance < 50) {
                    this.isSwallowed = true;
                    this.element.style.transform = "scale(0)";
                    this.element.style.opacity = "0";
                    playSynthSound('sine', 500, 100, 0.15);
                }

                if (distance < 120 && Math.random() < 0.02) {
                    playSynthSound('sawtooth', 100, 50, 0.3); 
                }
            }
        } else if (isReturningHome) {
            if (this.isSwallowed) {
                this.isSwallowed = false;
                this.x = lastVortexPos.x - this.width / 2;
                this.y = lastVortexPos.y - this.height / 2;
                this.element.style.transform = "scale(1)";
                this.element.style.opacity = "1";
                this.vx = (Math.random() - 0.5) * 30;
                this.vy = (Math.random() - 0.7) * 30;
            }

            const dxHome = this.homeX - this.x;
            const dyHome = this.homeY - this.y;
            const distanceToHome = Math.sqrt(dxHome * dxHome + dyHome * dyHome);

            if (distanceToHome > 2) {
                if (!this.hasPlayedReturnSound) {
                    playSynthSound('triangle', 400, 800, 0.4);
                    this.hasPlayedReturnSound = true;
                }
                this.x += dxHome * config.returnSpeed;
                this.y += dyHome * config.returnSpeed;
                this.vx = 0;
                this.vy = 0;
                
                this.element.style.left = `${this.x}px`;
                this.element.style.top = `${this.y}px`;
                return; 
            }
        } else {
            if (this.isSwallowed) {
                this.isSwallowed = false;
                this.element.style.transform = "scale(1)";
                this.element.style.opacity = "1";
            }
        }

        this.vx += config.gravityX;
        this.vy += config.gravityY;

        if (config.gravityY !== 0 || config.gravityX !== 0) {
            this.vx *= config.friction;
            this.vy *= config.friction;
        }

        this.x += this.vx;
        this.y += this.vy;

        const screenWidth = window.innerWidth || document.documentElement.clientWidth || 1000;
        const screenHeight = window.innerHeight || document.documentElement.clientHeight || 800;

        if (this.y + this.height > screenHeight) {
            this.y = screenHeight - this.height;
            this.vy = -this.vy * config.bounce;
        } else if (this.y < 0) {
            this.y = 0;
            this.vy = -this.vy * config.bounce;
        }

        if (this.x + this.width > screenWidth) {
            this.x = screenWidth - this.width;
            this.vx = -this.vx * config.bounce;
        } else if (this.x < 0) {
            this.x = 0;
            this.vx = -this.vx * config.bounce;
        }

        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
    }
}

function initEngine() {
    elements = [];
    const targets = document.querySelectorAll('.physics-obj');
    targets.forEach(el => elements.push(new PhysicsObject(el)));

    const blackHoleVisual = document.getElementById('black-hole');

    window.addEventListener('mousedown', (e) => {
        if (e.target.closest('#controls') || e.target.id === 'physics-input' || draggedElement) return;

        try {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        } catch(err){}
        
        isVortexActive = true;
        isReturningHome = false; 
        vortexPos.x = e.clientX;
        vortexPos.y = e.clientY;
        lastVortexPos.x = e.clientX;
        lastVortexPos.y = e.clientY;

        if (blackHoleVisual) {
            blackHoleVisual.style.left = `${e.clientX}px`;
            blackHoleVisual.style.top = `${e.clientY}px`;
            blackHoleVisual.classList.add('active');
        }
    });

    window.addEventListener('mousemove', (e) => {
        mouseVelocity.x = e.clientX - lastMousePos.x;
        mouseVelocity.y = e.clientY - lastMousePos.y;
        lastMousePos = { x: e.clientX, y: e.clientY };

        if (isVortexActive) {
            vortexPos.x = e.clientX;
            vortexPos.y = e.clientY;
            lastVortexPos.x = e.clientX;
            lastVortexPos.y = e.clientY;
            if (blackHoleVisual) {
                blackHoleVisual.style.left = `${e.clientX}px`;
                blackHoleVisual.style.top = `${e.clientY}px`;
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (isVortexActive) {
            isVortexActive = false;
            isReturningHome = true; 
            if (blackHoleVisual) {
                blackHoleVisual.classList.remove('active');
            }
            playSynthSound('square', 150, 600, 0.35);

            setTimeout(() => {
                isReturningHome = false;
            }, 2500);
        }

        if (draggedElement) {
            draggedElement.vx = mouseVelocity.x;
            draggedElement.vy = mouseVelocity.y;
            draggedElement.isDragged = false;
            draggedElement = null;
        }
    });

    const inputField = document.getElementById('physics-input');
    if (inputField) {
        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputField.value.trim() !== "") {
                const newBox = document.createElement('div');
                newBox.className = 'physics-obj spawned-box';
                newBox.textContent = inputField.value;

                const randomHue = Math.floor(Math.random() * 360);
                newBox.style.background = `hsl(${randomHue}, 70%, 45%)`;
                newBox.style.border = `1px solid hsl(${randomHue}, 80%, 65%)`;

                const inputRect = inputField.getBoundingClientRect();
                newBox.style.left = `${inputRect.left + (inputRect.width / 4)}px`;
                newBox.style.top = `${inputRect.top - 50}px`;

                document.body.appendChild(newBox);
                
                const physObj = new PhysicsObject(newBox);
                physObj.vx = (Math.random() - 0.5) * 20;
                physObj.vy = -Math.floor(Math.random() * 10) - 10;
                
                elements.push(physObj);
                inputField.value = "";
            }
        });
    }

    document.getElementById('toggle-gravity').addEventListener('click', function() {
        if (config.gravityY === 0 && config.gravityX === 0) {
            config.gravityY = 0.5;
            this.textContent = "Zero Gravity";
        } else {
            config.gravityX = 0;
            config.gravityY = 0;
            elements.forEach(obj => {
                obj.vx = (Math.random() - 0.5) * 8;
                obj.vy = (Math.random() - 0.5) * 8;
            });
            this.textContent = "Enable Gravity";
        }
    });

    document.getElementById('reverse-gravity').addEventListener('click', function() {
        config.gravityY = -config.gravityY;
        this.textContent = config.gravityY < 0 ? "Normal Gravity" : "Reverse Gravity";
    });

    document.getElementById('scatter').addEventListener('click', () => {
        elements.forEach(obj => {
            obj.vx = (Math.random() - 0.5) * 25;
            obj.vy = (Math.random() - 0.5) * 25;
        });
    });
}

function runEngine() {
    elements.forEach(obj => obj.update());
    requestAnimationFrame(runEngine);
}

// CRITICAL SAFE GUARD: Wrapped execution loop so window parameters can't freeze initialization
try {
    initEngine();
    runEngine();
} catch (error) {
    console.log("Engine recovered instantly.");
    window.addEventListener('load', () => {
        initEngine();
        runEngine();
    });
}