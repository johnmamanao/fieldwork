<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Every email Fieldwork sends, in one branded layout: an ink header with the wordmark,
 * a strip of vermilion "hours" cells (the landing hero's motif), a white card with a
 * heading, short paragraphs, optional label/value rows, one action button and a footnote.
 * A plain-text part with the same content goes with it.
 */
class FieldworkMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  list<string>  $lines  short paragraphs, in order
     * @param  list<array{0: string, 1: string}>  $rows  label/value pairs (invoice lines, totals)
     * @param  array{label: string, url: string}|null  $action  the one button
     */
    public function __construct(
        public string $mailSubject,
        public string $heading,
        public array $lines = [],
        public array $rows = [],
        public ?array $action = null,
        public ?string $footnote = null,
        public ?string $preheader = null,
        public ?string $total = null,
        public ?string $totalLabel = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->mailSubject);
    }

    public function content(): Content
    {
        return new Content(html: 'mail.fieldwork', text: 'mail.fieldwork-text');
    }
}
