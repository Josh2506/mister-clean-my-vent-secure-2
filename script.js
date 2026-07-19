const menuButton = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector("#mobile-nav");

menuButton?.addEventListener("click", () => {
  const isOpen = mobileNav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});

mobileNav?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileNav.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

const appointmentForm = document.querySelector(".quote-form");
const formStatus = document.querySelector(".form-status");

appointmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = appointmentForm.querySelector("button[type='submit']");
  const formData = new FormData(appointmentForm);
  const encodedData = new URLSearchParams(formData).toString();

  submitButton.disabled = true;
  formStatus.textContent = "Sending your appointment request...";

  try {
    const response = await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodedData,
    });

    if (!response.ok) {
      throw new Error("Form submission failed");
    }

    appointmentForm.reset();
    window.location.assign("/thank-you.html");
  } catch {
    formStatus.textContent = "Something went wrong. Please call or text (732) 626-0685.";
  } finally {
    submitButton.disabled = false;
  }
});
