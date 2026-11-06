<?php

if (! function_exists('money')) {
    /** Format integer minor units for messages and exports. Two-decimal currencies only (initial scope). */
    function money(int $cents, string $currency = 'USD'): string
    {
        $symbol = ['USD' => '$', 'EUR' => '€', 'GBP' => '£', 'AUD' => 'A$', 'CAD' => 'C$'][$currency] ?? $currency.' ';
        $sign = $cents < 0 ? '-' : '';

        return $sign.$symbol.number_format(abs($cents) / 100, 2);
    }
}
