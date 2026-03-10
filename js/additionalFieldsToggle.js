// Add this script at the end of index.html or in deliveryUI.js

// Enable/disable additional fields when checkboxes are toggled
document.addEventListener('DOMContentLoaded', () => {
    const additionalFields = [
        { checkbox: 'enableBatchField', input: 'materialBatch' },
        { checkbox: 'enableMfgDateField', input: 'materialMfgDate' },
        { checkbox: 'enableExpDateField', input: 'materialExpDate' },
        { checkbox: 'enableWeightField', input: 'materialWeight' },
        { checkbox: 'enableHeightField', input: 'materialHeight' },
        { checkbox: 'enableCountField', input: 'materialCount' }
    ];

    additionalFields.forEach(field => {
        const checkbox = document.getElementById(field.checkbox);
        const input = document.getElementById(field.input);

        if (checkbox && input) {
            checkbox.addEventListener('change', () => {
                input.disabled = !checkbox.checked;
                if (!checkbox.checked) {
                    input.value = '';
                }
            });
        }
    });
});
