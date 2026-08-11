import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Single registration point — every file that needs ScrollTrigger imports
// gsap/ScrollTrigger from here instead of registering the plugin itself.
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
