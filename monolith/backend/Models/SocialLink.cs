using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models
{
    [Table("social_links")]
    public class SocialLink
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [MaxLength(50)]
        public string Platform { get; set; } = string.Empty; // ex: LinkedIn, GitHub

        [Required]
        [MaxLength(300)]
        public string Url { get; set; } = string.Empty;

        [Required]
        public Guid UserId { get; set; }

        public int SortOrder { get; set; } = 0;
    }
}
