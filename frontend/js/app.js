/* ==========================================================================
   IT Helpdesk – Ticket Submission Portal
   Vanilla JavaScript: validation, custom styling hooks, character counter,
   native HTML5 dialog controls, theme switcher, and API fetch submission.
   ========================================================================== */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  // ----- Initialize Lucide Icons -----
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // ----- Element references -----
  const form = document.getElementById("ticketForm");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnText = document.getElementById("submitBtnText");
  const submitBtnSpinner = document.getElementById("submitBtnSpinner");
  const resetBtn = document.getElementById("resetBtn");
  const feedback = document.getElementById("feedback");

  const description = document.getElementById("description");
  const descriptionCounter = document.getElementById("descriptionCounter");

  // Custom Modal Elements (using native HTML5 <dialog>)
  const confirmModal = document.getElementById("confirmModal");
  const confirmSubmitBtn = document.getElementById("confirmSubmitBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");

  // Theme Switcher Elements
  const themeToggle = document.getElementById("themeToggle");

  // ----- State -----
  let pendingPayload = null; // form data waiting for confirmation

  // ----- Theme Switcher Logic -----
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = localStorage.getItem("theme") || (systemPrefersDark ? "dark" : "light");

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  };

  applyTheme(initialTheme);

  themeToggle.addEventListener("click", () => {
    const newTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(newTheme);
  });

  // ----- Custom Modal Controls -----
  const showModal = () => {
    confirmModal.showModal(); 
    confirmSubmitBtn.focus();
  };

  const hideModal = () => {
    confirmModal.close();
    pendingPayload = null;
  };

  modalCancelBtn.addEventListener("click", hideModal);

  // ----- Live character counter -----
  const updateCounter = () => {
    const len = description.value.length;
    const remaining = DESCRIPTION_MAX - len;
    descriptionCounter.textContent = `${len} / ${DESCRIPTION_MAX}`;

    const danger = remaining < 100;
    if (danger) {
      descriptionCounter.classList.remove("text-base-content/50");
      descriptionCounter.classList.add("text-error", "font-bold");
    } else {
      descriptionCounter.classList.remove("text-error", "font-bold");
      descriptionCounter.classList.add("text-base-content/50");
    }
  };

  description.addEventListener("input", updateCounter);
  updateCounter();

  // ----- Custom Form Validation Logic -----
  // Clear error styling on input/change events
  form.querySelectorAll("input, select, textarea").forEach((el) => {
    const clearError = () => {
      const group = el.closest(".form-group");
      if (group && el.checkValidity()) {
        group.classList.remove("is-invalid");
      }
    };
    el.addEventListener("input", clearError);
    el.addEventListener("change", clearError);
  });

  // ----- Collect & build payload -----
  const collectPayload = () => {
    const data = new FormData(form);
    return {
      fullName: data.get("fullName").trim(),
      email: data.get("email").trim(),
      type: data.get("type"),
      service: data.get("service"),
      sla: data.get("sla"),
      subject: data.get("subject").trim(),
      description: data.get("description").trim(),
      priority: data.get("priority"),
    };
  };

  // ----- Submit Form Action -----
  const handleSubmit = (event) => {
    event.preventDefault();

    // Reset error styling on all groups first
    form.querySelectorAll(".form-group").forEach((group) => {
      group.classList.remove("is-invalid");
    });

    // Check validity of form inputs
    if (!form.checkValidity()) {
      form.querySelectorAll("input:invalid, select:invalid, textarea:invalid").forEach((el) => {
        const group = el.closest(".form-group");
        if (group) {
          group.classList.add("is-invalid");
        }
      });
      // Focus on first invalid field
      form.querySelector("input:invalid, select:invalid, textarea:invalid")?.focus();
      return;
    }

    pendingPayload = collectPayload();
    showModal();
  };

  const sendTicket = async (payload) => {
    setLoading(true);
    clearFeedback();

    try {
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || `Request failed with status ${response.status}.`
        );
      }

      const ticketNumber = result.ticketNumber ? ` (Ticket #${result.ticketNumber})` : "";
      showFeedback(
        "success",
        `Your ticket has been submitted successfully!${ticketNumber}`
      );
      form.reset();
      updateCounter();
      resetBtn.blur();
    } catch (error) {
      showFeedback(
        "danger",
        `Submission failed: ${error.message}. Please try again later.`
      );
    } finally {
      setLoading(false);
    }
  };

  confirmSubmitBtn.addEventListener("click", () => {
    const payload = pendingPayload;
    hideModal();
    if (payload) sendTicket(payload);
  });

  // ----- Loading Spinner State -----
  const setLoading = (isLoading) => {
    submitBtn.disabled = isLoading;
    submitBtnText.textContent = isLoading ? "Submitting…" : "Submit Ticket";
    submitBtnSpinner.classList.toggle("hidden", !isLoading);
  };

  // ----- Custom Feedback Alerts -----
  const clearFeedback = () => {
    feedback.innerHTML = "";
  };

  const showFeedback = (type, message) => {
    const alertClass = type === "success" ? "alert-success" : "alert-error";
    const iconName = type === "success" ? "check-circle" : "alert-circle";
    feedback.innerHTML = `
      <div role="alert" class="alert ${alertClass} shadow-lg flex items-start gap-3 relative pr-10">
        <i data-lucide="${iconName}" class="w-5 h-5 flex-shrink-0 mt-0.5"></i>
        <div class="text-sm font-semibold">${escapeHtml(message)}</div>
        <button type="button" class="btn btn-ghost btn-xs btn-circle absolute top-2 right-2" id="toastCloseBtn" aria-label="Close">
          <i data-lucide="x" class="w-4 h-4"></i>
        </button>
      </div>
    `;

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }

    const toastCloseBtn = document.getElementById("toastCloseBtn");
    if (toastCloseBtn) {
      toastCloseBtn.addEventListener("click", clearFeedback);
    }
  };

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));

  // ----- Form Reset -----
  resetBtn.addEventListener("click", () => {
    // Let the browser reset fields asynchronously, then clean up state
    setTimeout(() => {
      form.querySelectorAll(".form-group").forEach((group) => {
        group.classList.remove("is-invalid");
      });
      updateCounter();
      clearFeedback();
      pendingPayload = null;
    }, 0);
  });

  // ----- Attach Form Event -----
  form.addEventListener("submit", handleSubmit);
});
