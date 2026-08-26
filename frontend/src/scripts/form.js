"use strict";

// API endpoint (relative → same origin, proxied to the backend).
const API_ENDPOINT = "/api/submit";

// Max length of the description field (must match the HTML maxlength).
const DESCRIPTION_MAX = 2000;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize Lucide Icons
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Element references
  const form = document.getElementById("ticketForm");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnText = document.getElementById("submitBtnText");
  const submitBtnSpinner = document.getElementById("submitBtnSpinner");
  const resetBtn = document.getElementById("resetBtn");
  const feedback = document.getElementById("feedback");

  const description = document.getElementById("description");
  const descriptionCounter = document.getElementById("descriptionCounter");

  const startTime = document.getElementById("startTime");
  const endTime = document.getElementById("endTime");

  const typeSelect = document.getElementById("type");
  const typeHidden = document.getElementById("typeHidden");
  const currentType = () => (typeSelect ? typeSelect.value : (typeHidden ? typeHidden.value : ""));
  const vehicleGroup = document.getElementById("vehicleGroup");
  const vehicleChipsEl = document.getElementById("vehicleChips");
  const vehicleInput = document.getElementById("vehicle");
  const vehicleLabel = document.getElementById("vehicleLabel");
  const vehicleError = document.getElementById("vehicleError");
  const paxGroup = document.getElementById("paxGroup");
  const paxChipsEl = document.getElementById("paxChips");
  const paxInput = document.getElementById("pax");
  const bookingDate = document.getElementById("bookingDate");

  // Custom Modal Elements (using native HTML5 <dialog>)
  const confirmModal = document.getElementById("confirmModal");
  const confirmSubmitBtn = document.getElementById("confirmSubmitBtn");
  const modalCancelBtn = document.getElementById("modalCancelBtn");

  // Theme Switcher Elements
  const themeToggle = document.getElementById("themeToggle");

  // State
  let pendingPayload = null;

  // Theme Switcher Logic
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme =
    localStorage.getItem("theme") || (systemPrefersDark ? "dark" : "light");

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  };

  applyTheme(initialTheme);

  themeToggle.addEventListener("click", () => {
    const newTheme =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    applyTheme(newTheme);
  });

  // Keyboard access for the logo toggle (Enter / Space)
  themeToggle.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      themeToggle.click();
    }
  });

  // Custom Modal Controls
  const showModal = () => {
    confirmModal.showModal();
    confirmSubmitBtn.focus();
  };

  const hideModal = () => {
    confirmModal.close();
    pendingPayload = null;
  };

  modalCancelBtn.addEventListener("click", hideModal);

  // Live character counter
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

  // Time dropdowns: 30-minute steps grouped by part of day
  const SLOT_STEP = 30;
  const SLOT_TOTAL = 24 * 60; // minutes per day

  const formatTimeLabel = (hhmm) => {
    const [hh, mm] = hhmm.split(":").map(Number);
    const hour = hh % 12 || 12;
    const suffix = hh < 12 ? "AM" : "PM";
    return `${hour}:${String(mm).padStart(2, "0")} ${suffix}`;
  };

  const timeOptions = [];
  const timeGroups = [
    { label: "Morning", from: 0, to: 12 * 60 },
    { label: "Afternoon", from: 12 * 60, to: 17 * 60 },
    { label: "Evening", from: 17 * 60, to: SLOT_TOTAL },
  ];

  for (let minutes = 0; minutes < SLOT_TOTAL; minutes += SLOT_STEP) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    timeOptions.push({ value: `${hh}:${mm}`, minutes });
  }

  const populateTimeSelect = (select) => {
    timeGroups.forEach((group) => {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      timeOptions.forEach((opt) => {
        if (opt.minutes >= group.from && opt.minutes < group.to) {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = formatTimeLabel(opt.value);
          optgroup.appendChild(option);
        }
      });
      select.appendChild(optgroup);
    });
  };

  populateTimeSelect(startTime);
  populateTimeSelect(endTime);

  // Disable End options at/before the chosen Start (structural validation)
  const updateEndOptions = () => {
    const startVal = startTime.value;
    Array.from(endTime.options).forEach((option) => {
      if (option.value === "") return;
      option.disabled = startVal && option.value <= startVal;
    });
    if (endTime.value && startVal && endTime.value <= startVal) {
      endTime.value = "";
    }
    validateTimeRange();
  };

  // End time must be after start time (safety net)
  const validateTimeRange = () => {
    const startVal = startTime.value;
    const endVal = endTime.value;
    if (startVal && endVal && endVal <= startVal) {
      endTime.setCustomValidity("End time must be after start time.");
    } else {
      endTime.setCustomValidity("");
    }
  };

  startTime.addEventListener("change", updateEndOptions);

  // Vehicle Type (parking) and No. of Pax (meeting room) quick-pick chips
  const createChipPicker = (container, hiddenInput, options, buttonClass) => {
    const render = () => {
      Array.from(container.children).forEach((btn) => {
        const selected = btn.textContent === hiddenInput.value;
        btn.classList.toggle("btn-primary", selected);
        btn.classList.toggle("btn-outline", !selected);
        btn.setAttribute("aria-pressed", String(selected));
      });
    };
    options.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = buttonClass;
      btn.textContent = option;
      btn.addEventListener("click", () => {
        hiddenInput.value = hiddenInput.value === option ? "" : option;
        render();
      });
      container.appendChild(btn);
    });
    return render;
  };

  const renderVehicleChips = createChipPicker(vehicleChipsEl, vehicleInput, [
    "Car (4-Wheels)",
    "Motorcycle (2-Wheels)",
  ], "btn btn-sm btn-outline normal-case flex-1 whitespace-nowrap min-w-[58px] px-3");
  const renderPaxChips = createChipPicker(
    paxChipsEl,
    paxInput,
    ["1-5", "6-10", "11-20", "21-50", "50+"],
    "btn btn-sm btn-outline normal-case flex-1 whitespace-nowrap px-3"
  );

  const updateTypeFields = () => {
    const type = currentType();
    const isParking = type === "Parking Lot Request";
    const isMeeting = type === "Meeting Room Reservation";

    // Vehicle group: always visible
    vehicleGroup.hidden = false;
    vehicleInput.disabled = false;
    vehicleInput.required = isParking;
    if (vehicleLabel) vehicleLabel.textContent = isParking ? "Vehicle Type" : "Parking (Optional)";
    if (vehicleError) vehicleError.textContent = isParking ? "Please select vehicle type." : "";
    renderVehicleChips();

    // Pax group: only for meeting room
    paxGroup.hidden = !isMeeting;
    paxInput.disabled = !isMeeting;
    if (isMeeting) {
      paxInput.required = true;
    } else {
      paxInput.required = false;
      paxInput.value = "";
    }
    renderPaxChips();
  };

  if (typeSelect) {
    typeSelect.addEventListener("change", updateTypeFields);
  }

  form.addEventListener("reset", () => {
    if (typeSelect) typeSelect.value = "Meeting Room Reservation";
    updateTypeFields();
    setTimeout(updateEndOptions, 0);
  });
  updateTypeFields();
  updateEndOptions();

  // Block past dates for the booking
  bookingDate.min = new Date().toLocaleDateString("en-CA");

  // Custom Form Validation Logic & Error Styling
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

  // Collect & build payload
  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    const [hh, mm] = timeStr.split(":"); // "08:00"
    const hour = Number(hh) % 12 || 12;
    const suffix = Number(hh) < 12 ? "AM" : "PM";
    return `${hour}:${mm} ${suffix}`; // "8:00 AM"
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-"); // "2026-08-14"
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    return `${months[Number(m) - 1]} ${Number(d)}, ${y}`; // "Aug 14, 2026"
  };

  const collectPayload = () => {
    const data = new FormData(form);
    return {
      firstName: data.get("firstName").trim(),
      lastName: data.get("lastName").trim(),
      email: data.get("email").trim(),
      type: data.get("type"),
      location: data.get("location").trim(),
      service: data.get("service")?.trim() || "",
      participants: data.get("participants")?.trim() || "",
      subject: data.get("subject").trim(),
      description: data.get("description").trim(),
      date: formatDate(data.get("date")),
      startTime: formatTime(data.get("startTime")),
      endTime: formatTime(data.get("endTime")),
    };
  };

  // Submit Form Action
  const handleSubmit = (event) => {
    event.preventDefault();

    // Reset error styling on all groups first
    form.querySelectorAll(".form-group").forEach((group) => {
      group.classList.remove("is-invalid");
    });

    // Check validity of form inputs
    if (!form.checkValidity()) {
      form
        .querySelectorAll("input:invalid, select:invalid, textarea:invalid")
        .forEach((el) => {
          const group = el.closest(".form-group");
          if (group) {
            group.classList.add("is-invalid");
          }
        });
      // Focus on first invalid field
      form
        .querySelector("input:invalid, select:invalid, textarea:invalid")
        ?.focus();
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

      const ticketNumber = result.ticketNumber
        ? ` (Ticket #${result.ticketNumber})`
        : "";
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

  // Loading Spinner State
  const setLoading = (isLoading) => {
    submitBtn.disabled = isLoading;
    submitBtnText.textContent = isLoading ? "Submitting…" : "Submit Ticket";
    submitBtnSpinner.classList.toggle("hidden", !isLoading);
  };

  // Custom Feedback Alerts
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
    })[char]);

  // Form Reset
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

  // Attach Form Event
  form.addEventListener("submit", handleSubmit);
});