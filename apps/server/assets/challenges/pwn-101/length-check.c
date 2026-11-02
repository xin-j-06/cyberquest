#include <stddef.h>

/* Harmless review-only sample: identify the missing bounds check. */
void handle_training_input(void) {
    char buffer[16];
    size_t length = read_length();

    read_input(buffer, length);
    process(buffer);
}
